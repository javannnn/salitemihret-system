import React from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchHouseholds } from "../api/client";
import { RoleGate } from "../components/RoleGate";

export const HouseholdsDemoRoute: React.FC = () => {
  const { data, isLoading, error } = useQuery({ queryKey: ["households", 5], queryFn: () => fetchHouseholds(5) });

  return (
    <RoleGate roles={["PR Administrator", "System Manager"]} loadingFallback={<p>Loading households…</p>} fallback={<p>Access denied.</p>}>
      {isLoading && <p>Loading households…</p>}
      {error && <p>Failed to load households.</p>}
      {!isLoading && !error && (
        <ul>
          {(data ?? []).map((household) => (
            <li key={household.name}>{household.household_name ?? household.name}</li>
          ))}
        </ul>
      )}
    </RoleGate>
  );
};

export default HouseholdsDemoRoute;
