ALTER TABLE "constante" ADD COLUMN "atividade_strava_id" bigint;--> statement-breakpoint
-- FTP de trabalho confirmado a 29/10/2026: 216 W (ramp test de 22/10/2026), não 211 W.
UPDATE "constante" SET "valor" = 216, "nota" = 'Ramp test Zwift de 22/10/2026 (método sempre usado para o FTP).' WHERE "chave" = 'ftp_w' AND "data_efetiva" = '2026-10-22' AND "valor" = 211;
