'use client';

import { useState } from 'react';
import { sendTestNotification } from '@/app/actions/telegram-actions';
import { Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function TelegramTestButton() {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleTest = async () => {
        setLoading(true);
        try {
            const res = await sendTestNotification();
            if (res.success) {
                toast({
                    title: "Thành công",
                    description: res.message,
                    variant: "default",
                });
            } else {
                toast({
                    title: "Thất bại",
                    description: res.message,
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Lỗi",
                description: "Không thể kết nối đến server.",
                variant: "destructive",
            });
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
