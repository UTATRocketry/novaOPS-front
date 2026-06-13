"use client";

import { useMutation } from "@tanstack/react-query";
import { sendCommand, sendSystemCommand } from "@/lib/api";
import type { CommandPayload, SystemCommandPayload } from "@/lib/types";

export function useSendCommand() {
  return useMutation({
    mutationFn: ({
      payload,
      clientId,
    }: {
      payload: CommandPayload;
      clientId: string;
    }) => sendCommand(payload, clientId),
  });
}

export function useSendSystemCommand() {
  return useMutation({
    mutationFn: ({
      payload,
      clientId,
    }: {
      payload: SystemCommandPayload;
      clientId: string;
    }) => sendSystemCommand(payload, clientId),
  });
}
