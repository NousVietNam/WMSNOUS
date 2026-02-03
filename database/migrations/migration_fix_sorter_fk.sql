
ALTER TABLE pick_waves 
DROP CONSTRAINT IF EXISTS pick_waves_sorter_id_fkey;

ALTER TABLE pick_waves
ADD CONSTRAINT pick_waves_sorter_id_fkey 
FOREIGN KEY (sorter_id) 
REFERENCES public.users(id);

-- Also for sorting_logs
ALTER TABLE sorting_logs 
DROP CONSTRAINT IF EXISTS sorting_logs_sorter_id_fkey;

ALTER TABLE sorting_logs
ADD CONSTRAINT sorting_logs_sorter_id_fkey 
FOREIGN KEY (sorter_id) 
REFERENCES public.users(id);
