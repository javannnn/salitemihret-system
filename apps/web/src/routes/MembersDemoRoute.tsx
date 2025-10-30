import React from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchMembers } from "../api/client";
import { RoleGate } from "../components/RoleGate";

export const MembersDemoRoute: React.FC = () => {
  const { data, isLoading, error } = useQuery({ queryKey: ["members", 5], queryFn: () => fetchMembers(5) });

  return (
    <RoleGate roles={["PR Administrator", "System Manager"]} loadingFallback={<p>Loading members…</p>} fallback={<p>Access denied.</p>}>
      {isLoading && <p>Loading members…</p>}
      {error && <p>Failed to load members.</p>}
      {!isLoading && !error && (
        <ul>
          {(data ?? []).map((member) => (
            <li key={member.name}>{member.member_name ?? `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim()}</li>
          ))}
        </ul>
      )}
    </RoleGate>
  );
};

export default MembersDemoRoute;
