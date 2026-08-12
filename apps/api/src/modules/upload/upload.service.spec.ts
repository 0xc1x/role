import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import { UploadService } from './upload.service';

const mockSupabase = {
  storage: {
    from: jest.fn().mockReturnThis(),
    upload: jest.fn(),
    getPublicUrl: jest.fn(),
  },
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe('UploadService', () => {
  let service: UploadService;

  const mockConfig: Record<string, string> = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_STORAGE_BUCKET: 'images',
    SUPABASE_ALLOWED_BUCKETS: 'images,avatars',
    SUPABASE_ALLOWED_FOLDERS: 'categories,users,products',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockConfig[key]),
          },
        },
      ],
    }).compile();

    service = module.get(UploadService);
    jest.clearAllMocks();
  });

  let validPngBuffer: Buffer;

  beforeAll(async () => {
    validPngBuffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
  });

  describe('uploadImage', () => {
    const baseFile = {
      fieldname: 'file',
      originalname: 'test-image.png',
      encoding: '7bit',
      mimetype: 'image/png',
    } as Express.Multer.File;

    beforeEach(() => {
      mockSupabase.storage.upload.mockResolvedValue({ error: null });
      mockSupabase.storage.getPublicUrl.mockReturnValue({
        data: {
          publicUrl:
            'https://test.supabase.co/storage/v1/object/public/images/categories/uuid.webp',
        },
      });
    });

    it('should compress to WebP and upload to Supabase', async () => {
      const file = { ...baseFile, buffer: validPngBuffer, size: validPngBuffer.length };

      const result = await service.uploadImage(file);

      expect(result.url).toContain('storage/v1/object/public/images/categories/');
      expect(result.url).toMatch(/\.webp$/);
      expect(mockSupabase.storage.from).toHaveBeenCalledWith('images');
      expect(mockSupabase.storage.upload).toHaveBeenCalledTimes(1);

      const uploadCall = mockSupabase.storage.upload.mock.calls[0];
      const uploadedBuffer = uploadCall[1];
      expect(uploadedBuffer).toBeInstanceOf(Buffer);
      expect(uploadCall[2].contentType).toBe('image/webp');
    });

    it('should resize large images to max 1920px', async () => {
      const largeBuffer = await sharp({
        create: {
          width: 3000,
          height: 2000,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const file = { ...baseFile, buffer: largeBuffer, size: largeBuffer.length };

      await service.uploadImage(file);

      const uploadedBuffer = mockSupabase.storage.upload.mock.calls[0][1];
      const metadata = await sharp(uploadedBuffer).metadata();

      expect(metadata.width).toBeLessThanOrEqual(1920);
      expect(metadata.height).toBeLessThanOrEqual(1920);
    });

    it('should throw on upload error', async () => {
      const file = { ...baseFile, buffer: validPngBuffer, size: validPngBuffer.length };
      mockSupabase.storage.upload.mockResolvedValue({
        error: new Error('Bucket not found'),
      });

      await expect(service.uploadImage(file)).rejects.toThrow(
        'Failed to upload image: Bucket not found',
      );
    });

    it('should generate unique paths for each upload', async () => {
      const file = { ...baseFile, buffer: validPngBuffer, size: validPngBuffer.length };

      await service.uploadImage(file);
      await service.uploadImage(file);

      const path1 = mockSupabase.storage.upload.mock.calls[0][0];
      const path2 = mockSupabase.storage.upload.mock.calls[1][0];
      expect(path1).not.toBe(path2);
    });

    it('should store files under categories/ prefix by default', async () => {
      const file = { ...baseFile, buffer: validPngBuffer, size: validPngBuffer.length };

      await service.uploadImage(file);

      const uploadPath = mockSupabase.storage.upload.mock.calls[0][0];
      expect(uploadPath).toMatch(/^categories\//);
      expect(uploadPath).toMatch(/\.webp$/);
    });

    it('should use custom bucket and folder when provided', async () => {
      const file = { ...baseFile, buffer: validPngBuffer, size: validPngBuffer.length };

      await service.uploadImage(file, { bucket: 'avatars', folder: 'users' });

      expect(mockSupabase.storage.from).toHaveBeenCalledWith('avatars');
      const uploadPath = mockSupabase.storage.upload.mock.calls[0][0];
      expect(uploadPath).toMatch(/^users\//);
    });

    it('should fallback to env bucket when only folder is provided', async () => {
      const file = { ...baseFile, buffer: validPngBuffer, size: validPngBuffer.length };

      await service.uploadImage(file, { folder: 'products' });

      expect(mockSupabase.storage.from).toHaveBeenCalledWith('images');
      const uploadPath = mockSupabase.storage.upload.mock.calls[0][0];
      expect(uploadPath).toMatch(/^products\//);
    });

    it('should reject a disallowed bucket', async () => {
      const file = { ...baseFile, buffer: validPngBuffer, size: validPngBuffer.length };

      await expect(
        service.uploadImage(file, { bucket: 'invoices', folder: 'categories' }),
      ).rejects.toThrow('Bucket "invoices" no permitido');
    });

    it('should reject a disallowed folder', async () => {
      const file = { ...baseFile, buffer: validPngBuffer, size: validPngBuffer.length };

      await expect(
        service.uploadImage(file, { bucket: 'images', folder: 'admin-panel' }),
      ).rejects.toThrow('Carpeta "admin-panel" no permitida');
    });
  });
});
