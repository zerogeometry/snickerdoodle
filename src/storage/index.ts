export { getS3, getPresignS3, storageConfig, type StorageConfig } from './client';
export { stripExif, hasExif, ImageTooLargeError, MAX_UPLOAD_PIXELS, type SanitisedImage } from './exif';
export {
  ensureBucket,
  originalKey,
  quarantineKey,
  QUARANTINE_PREFIX,
  derivativeKey,
  assetPrefix,
  deleteAllUnderPrefix,
  putObject,
  getObjectBytes,
  presignDownload,
  presignProviderIngest,
  deleteObject,
  deleteObjectConfirmed,
  encryptionFor,
} from './objects';
export {
  MAX_UPLOAD_BYTES,
  DIRECT_UPLOAD_TTL_SECONDS,
  QUARANTINE_CONTENT_TYPE,
  isAcceptableUploadSize,
  presignQuarantineUpload,
  headObject,
  listQuarantine,
  deleteQuarantineObject,
  type PresignedUpload,
} from './quarantine';
