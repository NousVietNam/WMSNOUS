
CREATE OR REPLACE FUNCTION reset_launch_soon_alerts()
RETURNS void AS $$
BEGIN
    UPDATE restricted_inventory 
    SET is_alerted = FALSE,
        alerted_at = NULL
    WHERE is_launching_soon = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
