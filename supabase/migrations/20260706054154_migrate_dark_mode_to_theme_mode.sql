alter table public.user_preferences add column theme_mode text not null default 'system';

update public.user_preferences
set theme_mode = case 
  when dark_mode = true then 'dark'
  else 'light'
end;

alter table public.user_preferences drop column dark_mode;