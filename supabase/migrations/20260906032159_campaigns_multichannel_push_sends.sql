-- Campañas multi-canal (email | push; whatsapp a futuro)
CREATE TYPE campaign_channel AS ENUM ('email', 'push');
ALTER TABLE campaigns ADD COLUMN channel campaign_channel NOT NULL DEFAULT 'email';

-- Desatar campaigns de email: template_id pasa a uuid polimórfico (email_templates | push_templates)
ALTER TABLE campaigns DROP CONSTRAINT campaigns_template_id_fkey;

-- Overrides email-specific fuera
ALTER TABLE campaigns DROP COLUMN subject_override;
ALTER TABLE campaigns DROP COLUMN body_override;

-- Contador genérico de fallos (push lo usa; email lo refleja desde email_sends)
ALTER TABLE campaigns ADD COLUMN total_failed integer NOT NULL DEFAULT 0;

-- Ledger por destinatario para campañas push (espejo del patrón email_sends)
CREATE TYPE push_send_status AS ENUM ('pending', 'queued', 'sent', 'failed');
CREATE TABLE push_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  status push_send_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);
CREATE INDEX push_sends_campaign_status_idx ON push_sends (campaign_id, status);