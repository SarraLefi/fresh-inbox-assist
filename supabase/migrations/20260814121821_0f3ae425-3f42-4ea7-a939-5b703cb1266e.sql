CREATE TABLE public.gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gmail_accounts TO service_role;
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.generated_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  thread_id text,
  subject text,
  to_email text,
  body text NOT NULL,
  gmail_draft_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX generated_drafts_account_message_idx ON public.generated_drafts (account_id, message_id);
GRANT ALL ON public.generated_drafts TO service_role;
ALTER TABLE public.generated_drafts ENABLE ROW LEVEL SECURITY;