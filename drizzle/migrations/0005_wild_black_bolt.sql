ALTER TABLE "message_sources" DROP CONSTRAINT "message_sources_chunk_id_document_chunks_id_fk";
--> statement-breakpoint
ALTER TABLE "message_sources" ADD CONSTRAINT "message_sources_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE cascade ON UPDATE no action;