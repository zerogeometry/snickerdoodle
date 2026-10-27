"""
Convert a Real-ESRGAN compact (SRVGGNetCompact) PyTorch checkpoint to ONNX, no torch needed.

Dev-time only: the converted model is committed under models/sr/ and the app checks its sha256
before loading it. Re-run only to change the model:

  python3 -m venv /tmp/sr && /tmp/sr/bin/pip install --only-binary=:all: onnx numpy
  curl -L -o /tmp/sr/realesr-animevideov3.pth \
    https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth
  /tmp/sr/bin/python -I scripts/ml/convert-realesrgan.py /tmp/sr/realesr-animevideov3.pth \
    models/sr/realesr-animevideov3-x4.onnx

The checkpoint is a zip holding a pickle plus raw tensor storages. We unpickle with a strict
allow-list (only the few names a state_dict uses), so a tampered file can't run code.
"""
import hashlib
import io
import pickle
import sys
import zipfile
from collections import OrderedDict

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

# Pinned release assets (Real-ESRGAN v0.2.5.0, BSD-3-Clause).
EXPECTED_SHA256 = {
    'realesr-animevideov3.pth': 'b8a8376811077954d82ca3fcf476f1ac3da3e8a68a4f4d71363008000a18b75d',
    'realesr-general-x4v3.pth': '8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292',
}

DTYPES = {'FloatStorage': np.float32, 'HalfStorage': np.float16}


class _StorageType:
    def __init__(self, name):
        self.name = name


def _contiguous(size):
    out, acc = [], 1
    for d in reversed(size):
        out.insert(0, acc)
        acc *= d
    return out


def load_state_dict(path):
    zf = zipfile.ZipFile(path)
    root = zf.namelist()[0].split('/')[0]
    storages = {}

    def rebuild_tensor(storage, offset, size, stride, *_):
        dtype, key = storage
        raw = storages.get(key)
        if raw is None:
            raw = np.frombuffer(zf.read(f'{root}/data/{key}'), dtype=dtype)
            storages[key] = raw
        size = list(size)
        if list(stride) != _contiguous(size):
            arr = np.lib.stride_tricks.as_strided(raw[offset:], shape=size, strides=[s * raw.itemsize for s in stride])
            return np.array(arr, dtype=np.float32)
        n = int(np.prod(size)) if size else 1
        return np.array(raw[offset:offset + n], dtype=np.float32).reshape(size)

    class Unpickler(pickle.Unpickler):
        def find_class(self, module, name):
            if module == 'collections' and name == 'OrderedDict':
                return OrderedDict
            if module == 'torch._utils' and name == '_rebuild_tensor_v2':
                return rebuild_tensor
            if module == 'torch' and name in DTYPES:
                return _StorageType(name)
            raise pickle.UnpicklingError(f'refusing to load {module}.{name}')

        def persistent_load(self, pid):
            # ('storage', storage_type, key, location, numel)
            _, kind, key, _loc, _n = pid
            return (DTYPES[kind.name], key)

    obj = Unpickler(io.BytesIO(zf.read(f'{root}/data.pkl'))).load()
    for k in ('params_ema', 'params'):
        if isinstance(obj, dict) and k in obj:
            return obj[k]
    return obj


def build(sd, upscale=4):
    """SRVGGNetCompact: conv, (prelu, conv)*, conv to 3*s*s, pixel-shuffle, plus nearest-upsampled input."""
    idx = sorted({int(k.split('.')[1]) for k in sd if k.startswith('body.')})
    nodes, inits = [], []
    cur = 'input'
    for i in idx:
        w = sd.get(f'body.{i}.weight')
        b = sd.get(f'body.{i}.bias')
        if b is not None:  # conv 3x3
            inits += [numpy_helper.from_array(w, f'w{i}'), numpy_helper.from_array(b, f'b{i}')]
            nodes.append(helper.make_node('Conv', [cur, f'w{i}', f'b{i}'], [f't{i}'], kernel_shape=[3, 3], pads=[1, 1, 1, 1]))
        else:  # PReLU, one slope per channel, broadcast as [C,1,1]
            inits.append(numpy_helper.from_array(w.reshape(-1, 1, 1), f'w{i}'))
            nodes.append(helper.make_node('PRelu', [cur, f'w{i}'], [f't{i}']))
        cur = f't{i}'
    # torch PixelShuffle == ONNX DepthToSpace in CRD mode
    nodes.append(helper.make_node('DepthToSpace', [cur], ['shuf'], blocksize=upscale, mode='CRD'))
    inits.append(numpy_helper.from_array(np.array([1, 1, upscale, upscale], dtype=np.float32), 'scales'))
    nodes.append(helper.make_node('Resize', ['input', '', 'scales'], ['base'], mode='nearest', nearest_mode='floor', coordinate_transformation_mode='asymmetric'))
    nodes.append(helper.make_node('Add', ['shuf', 'base'], ['output']))
    graph = helper.make_graph(
        nodes,
        'srvgg_compact',
        [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, 'h', 'w'])],
        [helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3, 'H', 'W'])],
        inits,
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 17)], producer_name='snickerdoodle-convert-realesrgan')
    model.ir_version = 8
    onnx.checker.check_model(model)
    return model


def main(src, dst):
    data = open(src, 'rb').read()
    sha = hashlib.sha256(data).hexdigest()
    base = src.replace('\\', '/').rsplit('/', 1)[-1]
    if base in EXPECTED_SHA256 and EXPECTED_SHA256[base] != sha:
        sys.exit(f'sha256 mismatch for {base}: {sha}')
    onnx.save(build(load_state_dict(src)), dst)
    print('wrote', dst, hashlib.sha256(open(dst, 'rb').read()).hexdigest())


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
