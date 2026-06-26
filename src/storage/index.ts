export { getS3, storageConfig, type StorageConfig } from './client';
export { stripExif, hasExif, type SanitisedImage } from './exif';
export {
  ensureBucket,
  originalKey,
  derivativeKey,
  putObject,
  getObjectBytes,
  presignDownload,
  deleteObject,
  deleteObjectConfirmed,
} from './objects';
