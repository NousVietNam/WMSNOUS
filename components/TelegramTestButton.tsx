'use client';

import { useState } from 'react';
import { sendTestNotification } from '@/app/actions/telegram-actions';
import { Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function TelegramTestButton() {
    const [loading, setLoading] = useState(false);

    const handleTest = async () => {
        setLoading(true);
        try {
            const res = await sendTestNotification();
            if (res.success) {
                toast.success("Thành công: " + res.message);
            } else {
                toast.error("Thất bại: " + res.message);
            }
        } catch (error) {
            toast.error("Lỗi: Không thể kết nối đến server.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={loading}
            className="gap-2"
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4 text-blue-500" />}
            Test Telegram
        </Button>
    );
}
