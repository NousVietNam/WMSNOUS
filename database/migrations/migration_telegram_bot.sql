
-- 1. Enable pg_net extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- 2. Create the Trigger Function to Call Telegram API
CREATE OR REPLACE FUNCTION notify_telegram_exception()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- REPLACE WITH YOUR TELEGRAM BOT TOKEN AND CHAT ID
    -- You can also store these in a 'secrets' table or Vault if you want more security, but for now hardcode is easiest for "free" quick start.
    v_bot_token TEXT := '7456729831:AAE2V8y-D2Zt73wUqKxGj-u0Z0yPz1XqXqX'; -- Dummy Token (User needs to replace)
    v_chat_id TEXT := '-1001234567890'; -- Dummy Chat ID (User needs to replace)
    
    v_message TEXT;
    v_product_name TEXT;
    v_box_code TEXT;
    v_user_name TEXT;
    v_request_id BIGINT;
BEGIN
    -- Only notify on INSERT (New Exception)
    IF TG_OP = 'INSERT' THEN
        
        -- Get additional info for message
        SELECT name INTO v_product_name FROM products WHERE id = NEW.product_id;
        SELECT code INTO v_box_code FROM boxes WHERE id = NEW.box_id;
        SELECT name INTO v_user_name FROM auth.users WHERE id = NEW.user_id;
        
        -- Format Message
        v_message := format(
            '⚠️ *BÁO CÁO NGOẠI LỆ KHO* ⚠️%0A' ||
            '📦 *Box:* %s%0A' ||
            '🛒 *SP:* %s%0A' ||
            '🔢 *Yêu cầu:* %s | *Thực tế:* %s%0A' ||
            '👤 *Nhân viên:* %s%0A' ||
            '📝 *Lý do:* %s%0A%0A' ||
            '👉 *Vui lòng kiểm tra Admin ngay!*',
            
            COALESCE(v_box_code, 'N/A'),
            COALESCE(v_product_name, 'N/A'),
            NEW.quantity_expected,
            NEW.quantity_actual,
            COALESCE(v_user_name, 'N/A'),
            COALESCE(NEW.note, 'Không có')
        );

        -- Send Request via pg_net
        -- Note: URL encoding for message body is handled roughly here better to use json body if API supports it, 
        -- but Telegram simple API uses GET/POST with params. 
        -- Let's use simple POST JSON.
        
        PERFORM net.http_post(
            url := 'https://api.telegram.org/bot' || v_bot_token || '/sendMessage',
            body := jsonb_build_object(
                'chat_id', v_chat_id,
                'text', v_message, -- Note: This might NOT parse markdown if we send JSON like this without 'parse_mode'
                'parse_mode', 'Markdown' -- or 'HTML'
            )::jsonb
        );
        
    END IF;
    RETURN NEW;
END;
$$;

-- 3. Create Trigger
DROP TRIGGER IF EXISTS trg_notify_telegram_exception ON picking_exceptions;
CREATE TRIGGER trg_notify_telegram_exception
AFTER INSERT ON picking_exceptions
FOR EACH ROW
EXECUTE FUNCTION notify_telegram_exception();
