-- Add 'txt' to the allowed file_type values for the documents table
-- This supports the new TXT and MD file upload feature (MD files are stored as 'txt' type)
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_file_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_file_type_check CHECK (file_type IN ('pdf', 'docx', 'txt'));
