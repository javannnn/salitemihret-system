import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { whoami, WhoAmI } from "@/lib/auth";
import { useToast } from "@/components/Toast";

export default function Dashboard() {
  const [me, setMe] = useState<WhoAmI | null>(null);
  const toast = useToast();

  useEffect(() => {
    whoami()
      .then(setMe)
      .catch(() => toast.push("Failed to load profile"));
  }, [toast]);

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card className="p-6 space-y-2">
        <div className="text-xs uppercase text-mute">Signed in as</div>
        <div className="text-2xl font-semibold">{me?.full_name || "…"}</div>
        <div className="text-sm text-mute">{me?.user}</div>
        <div className="text-xs text-mute">Roles: {(me?.roles || []).join(", ")}</div>
      </Card>
      <Card className="p-6 space-y-2">
        <div className="text-xs uppercase text-mute">Membership</div>
        <div className="text-xl font-semibold">Manage parish members</div>
        <p className="text-sm text-mute">Create, update, and archive member records.</p>
      </Card>
      <Card className="p-6 space-y-2">
        <div className="text-xs uppercase text-mute">Next steps</div>
        <div className="text-xl font-semibold">Use the left navigation</div>
        <p className="text-sm text-mute">Explore the Members area to view the live data feed.</p>
      </Card>
    </div>
  );
}
