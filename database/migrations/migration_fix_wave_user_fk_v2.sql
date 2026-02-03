
ALTER TABLE pick_waves
ADD CONSTRAINT pick_waves_created_by_profiles_fkey
FOREIGN KEY (created_by)
REFERENCES users(id);
