-- Reject parent cycles on schedule_tasks at the DB boundary (defense in depth
-- behind the client-side guard). Walks the ancestor chain when parent_task_id
-- is set/changed; raises on self-parent or a cycle.
create or replace function prevent_schedule_task_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cursor_id uuid := NEW.parent_task_id;
  depth int := 0;
begin
  if NEW.parent_task_id is null then
    return NEW;
  end if;
  if NEW.parent_task_id = NEW.id then
    raise exception 'schedule_task % cannot be its own parent', NEW.id;
  end if;
  while cursor_id is not null and depth < 1000 loop
    if cursor_id = NEW.id then
      raise exception 'schedule_task % parent change would create a cycle', NEW.id;
    end if;
    select parent_task_id into cursor_id from schedule_tasks where id = cursor_id;
    depth := depth + 1;
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_prevent_schedule_task_cycle on schedule_tasks;

create trigger trg_prevent_schedule_task_cycle
  before insert or update of parent_task_id on schedule_tasks
  for each row
  execute function prevent_schedule_task_cycle();
