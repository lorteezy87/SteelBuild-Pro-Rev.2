-- SteelBuild Pro -- Storage Setup
-- Run this AFTER creating the "app-files" bucket in the Supabase Dashboard:
--   Dashboard > Storage > New Bucket > Name: app-files > Public bucket: ON
--
-- Then run this SQL to add the access policies.

-- Allow authenticated users to upload files
CREATE POLICY "auth_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'app-files');

-- Allow authenticated users to read files
CREATE POLICY "auth_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'app-files');

-- Allow authenticated users to delete their uploads
CREATE POLICY "auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'app-files');

-- Allow anonymous/public read so shared file URLs work
CREATE POLICY "public_read" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'app-files');
