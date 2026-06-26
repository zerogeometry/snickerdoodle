'use client';

import { IconCamera, IconRefresh, IconUpload, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

/**
 * A real camera capture (getUserMedia) — not a file picker. Prefers the rear
 * camera on mobile, falls back to any camera, and degrades gracefully to "upload
 * instead" when there's no camera or permission is denied. The stream is stopped
 * on close so the camera light goes off.
 */
export function CameraCapture({
  open,
  onClose,
  onCapture,
  onUploadInstead,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string, name: string) => void;
  onUploadInstead: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    setShot(null);
    setError(null);
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) setError("We couldn't reach a camera. You can upload a photo instead.");
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, stop]);

  if (!open) return null;

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    setShot(canvas.toDataURL('image/png'));
    stop(); // freeze the frame; turn the camera off
  };

  const retake = () => {
    setShot(null);
    // re-open the stream
    setError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => setError("We couldn't reach a camera. You can upload a photo instead."));
  };

  const usePhoto = () => {
    if (!shot) return;
    onCapture(shot, 'photo.png');
    stop();
    onClose();
  };

  const close = () => {
    stop();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-cocoa/50 backdrop-blur-[2px]" onClick={close} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Take a photo" className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-[#FFFDF8] shadow-[0_20px_50px_rgba(46,39,35,.28)]">
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="font-display text-lg font-semibold text-cocoa">Take a photo</h2>
          <button type="button" onClick={close} aria-label="Close" className="-mr-1 rounded-full p-1 text-[#B3A491] hover:bg-[#F2EADB]">
            <Icon icon={IconX} size={18} />
          </button>
        </div>

        <div className="px-5 py-2">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-cocoa">
            {error ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[#FBF5E9]">
                <Icon icon={IconCamera} size={28} className="opacity-70" />
                <p>{error}</p>
              </div>
            ) : shot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot} alt="Captured photo" className="h-full w-full object-cover" />
            ) : (
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5 border-t border-[#F2EADB] px-5 pb-5 pt-3">
          {error ? (
            <Button size="lg" onClick={() => { close(); onUploadInstead(); }}>
              <Icon icon={IconUpload} size={16} /> upload instead
            </Button>
          ) : shot ? (
            <>
              <Button variant="secondary" size="lg" onClick={retake}>
                <Icon icon={IconRefresh} size={16} /> retake
              </Button>
              <Button size="lg" onClick={usePhoto}>
                use this photo
              </Button>
            </>
          ) : (
            <Button size="lg" onClick={capture}>
              <Icon icon={IconCamera} size={18} /> capture
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
