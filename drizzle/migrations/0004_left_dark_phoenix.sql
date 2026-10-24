ALTER TABLE "document_pages" ADD COLUMN "is_ocr" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_pages" ADD COLUMN "ocr_confidence" real;