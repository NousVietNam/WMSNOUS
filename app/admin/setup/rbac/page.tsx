"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { AdminHeader } from "@/components/admin/AdminHeader"
import { supabase } from "@/lib/supabase"

export default function RbacSetupPage() {
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState<string>("")

    const sqlScript = `
-- 1. CreateRoles Table
create table if not exists roles (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  code text not null unique,
  created_at timestamptz default now()
);

-- 2. Create Permissions Table
create table if not exists role_permissions (
  role_id uuid references roles(id) on delete cascade primary key,
  permissions jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 3. Seed Default Roles (Safe to run multiple times)
insert into roles (name, code) values 
('Quản Lý', 'ADMIN'), 
('Nhân Viên', 'STAFF') 
on conflict (code) do nothing;

-- 4. Seed Default Permissions
-- ADMIN gets everything
insert into role_permissions (role_id, permissions) 
select id, '{"ALL": true}'::jsonb 
from roles where code = 'ADMIN' 
on conflict (role_id) do nothing;

-- STAFF gets basic mobile features
insert into role_permissions (role_id, permissions) 
select id, '{"MOBILE_PICKING": true, "MOBILE_PUTAWAY": true, "MOBILE_LOOKUP": true, "MOBILE_BARCODE": true}'::jsonb 
from roles where code = 'STAFF' 
on conflict (role_id) do nothing;
`

    const handleCopy = () => {
        navigator.clipboard.writeText(sqlScript)
        alert("Đã copy SQL! Hãy paste vào Supabase SQL Editor.")
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <AdminHeader />
            <main className="p-8 max-w-4xl mx-auto space-y-6">
                <div>
                    <h1 className="text-2xl font-bold mb-2">Cài Đặt Database Phân Quyền (RBAC)</h1>
                    <p className="text-slate-600">
                        Do giới hạn bảo mật, ứng dụng không thể tự tạo bảng mới.
                        Vui lòng làm theo các bước sau để khởi tạo hệ thống phân quyền.
                    </p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow border border-slate-200 space-y-4">
                    <h3 className="font-bold text-lg border-b pb-2">Bước 1: Copy đoạn lệnh SQL này</h3>

                    <div className="relative">
                        <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed">
                            {sqlScript}
                        </pre>
                        <Button
                            className="absolute top-2 right-2"
                            size="sm"
                            variant="secondary"
                            onClick={handleCopy}
                        >
                            Copy SQL
                        </Button>
                    </div>

                    <h3 className="font-bold text-lg border-b pb-2 pt-4">Bước 2: Chạy lệnh trên Supabase</h3>
                    <ol className="list-decimal list-inside space-y-2 text-slate-700">
                        <li>Truy cập vào <b>Supabase Dashboard</b> của dự án.</li>
                        <li>Vào mục <b>SQL Editor</b> (icon thứ 3 bên trái).</li>
                        <li>Bấm <b>New Query</b>.</li>
                        <li>Paste đoạn lệnh trên vào và bấm <b>Run</b>.</li>
                    </ol>

                    <div className="p-4 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-sm">
                        <b>Lưu ý:</b> Sau khi chạy xong, hãy quay lại đây và F5 để bắt đầu sử dụng tính năng Phân Quyền.
                    </div>

                    <div className="flex justify-end pt-4">
                        <Button onClick={() => window.location.href = '/admin/roles'}>
                            Đã Chạy Xong - Vào Trang Quản Lý Role
                        </Button>
                    </div>
                </div>
            </main>
        </div>
    )
}
