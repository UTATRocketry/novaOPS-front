"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { assignRole, getRoles } from "@/lib/api";
import type { RoleAssignPayload } from "@/lib/types";
import { queryKeys } from "./queryKeys";

export function useRoles() {
  return useQuery({ queryKey: queryKeys.roles, queryFn: getRoles });
}

export function useAssignRole() {
  return useMutation({
    mutationFn: ({
      payload,
      clientId,
    }: {
      payload: RoleAssignPayload;
      clientId: string;
    }) => assignRole(payload, clientId),
  });
}
