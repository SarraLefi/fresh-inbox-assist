-- Create table for storing user writing samples used to personalize generated replies
create table if not exists writing_samples (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null,
  subject text,
  body text,
  created_at timestamptz default now()
);

create index if not exists writing_samples_user_id_idx on writing_samples (user_id);
