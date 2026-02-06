-- Add columns to abandoned_checkouts to support CRM pipeline
ALTER TABLE abandoned_checkouts 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Carrinho Abandonado',
ADD COLUMN IF NOT EXISTS msg1_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS msg2_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS msg3_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMP WITH TIME ZONE;

-- Update existing records to have a default status if they don't have one
UPDATE abandoned_checkouts SET status = 'Carrinho Abandonado' WHERE status IS NULL;
