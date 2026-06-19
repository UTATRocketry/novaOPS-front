"use client";

import { useState } from "react";
import {
  Dialog,
  Portal,
  NativeSelect,
  Input,
  Button,
  Flex,
  Box,
  Text,
  IconButton,
} from "@chakra-ui/react";
import { Icon, Mono } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import { useAssignRole } from "@/hooks";
import type { ClientRole } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_BG: Record<ClientRole, string> = {
  viewer:   "role.viewer",
  pad:      "role.pad",
  operator: "role.operator",
  admin:    "role.admin",
};

const ROLE_LABELS: Record<ClientRole, string> = {
  viewer:   "Viewer",
  pad:      "Pad",
  operator: "Operator",
  admin:    "Admin",
};

const ROLE_DESCRIPTIONS: Record<ClientRole, string> = {
  viewer:   "Read-only access to all telemetry and views.",
  pad:      "Pad-side operations and local hardware checks.",
  operator: "Command valves, run procedures, control the system.",
  admin:    "Full configuration and administrative control. Requires password.",
};

// ---------------------------------------------------------------------------
// RoleModal
// ---------------------------------------------------------------------------

export interface RoleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RoleModal({ isOpen, onClose }: RoleModalProps) {
  const currentRole = useNovaStore(sel.sessionRole);
  const clientId    = useNovaStore(sel.clientId);

  const [selectedRole, setSelectedRole] = useState<ClientRole>(
    currentRole ?? "viewer",
  );
  const [password, setPassword] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);

  const { mutate: assignRole, isPending } = useAssignRole();

  // Reset local state whenever the modal opens or closes
  function handleOpenChange(open: boolean) {
    if (!open) {
      setPassword("");
      setInlineError(null);
      onClose();
    }
  }

  function handleRoleChange(role: ClientRole) {
    setSelectedRole(role);
    setInlineError(null);
    if (role !== "admin") setPassword("");
  }

  function handleSubmit() {
    if (!clientId) return;
    setInlineError(null);

    assignRole(
      {
        payload: {
          role: selectedRole,
          password: selectedRole === "admin" ? password : undefined,
        },
        clientId,
      },
      {
        onSuccess: () => {
          setPassword("");
          setInlineError(null);
          onClose();
        },
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : "An unexpected error occurred.";
          setInlineError(message);
        },
      },
    );
  }

  const notConnected = clientId === null;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(e) => handleOpenChange(e.open)}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            bg="bg.surface"
            border="1px solid"
            borderColor="border.default"
            borderRadius="card"
            maxW="400px"
            w="100%"
          >
            {/* Close trigger */}
            <Dialog.CloseTrigger asChild>
              <IconButton
                aria-label="Close role modal"
                variant="ghost"
                size="sm"
                position="absolute"
                top={2}
                right={2}
                color="text.muted"
                _hover={{ color: "text.primary" }}
              >
                <Icon name="close" size={16} />
              </IconButton>
            </Dialog.CloseTrigger>

            {/* Header */}
            <Dialog.Header pb={2}>
              <Text
                fontWeight="600"
                fontSize="sm"
                color="text.primary"
                letterSpacing="0.03em"
              >
                Change Session Role
              </Text>
            </Dialog.Header>

            {/* Body */}
            <Dialog.Body display="flex" flexDirection="column" gap={4} pt={0}>
              {/* Current role badge */}
              <Flex align="center" gap={2}>
                <Text fontSize="xs" color="text.muted">
                  Current:
                </Text>
                {currentRole ? (
                  <Flex
                    as="span"
                    display="inline-flex"
                    align="center"
                    gap={1.5}
                    px={2}
                    py={0.5}
                    borderRadius="chip"
                    bg={ROLE_BG[currentRole]}
                  >
                    <Icon name="badge" size={12} color="white" />
                    <Mono fontWeight="700" fontSize="xs" color="white">
                      {ROLE_LABELS[currentRole].toUpperCase()}
                    </Mono>
                  </Flex>
                ) : (
                  <Mono fontSize="xs" color="text.muted">
                    —
                  </Mono>
                )}
              </Flex>

              {/* Role selector */}
              <Box>
                <Text
                  fontSize="xs"
                  color="text.muted"
                  mb={1}
                  fontWeight="500"
                >
                  Select role
                </Text>
                <NativeSelect.Root size="sm">
                  <NativeSelect.Field
                    value={selectedRole}
                    onChange={(e) =>
                      handleRoleChange(e.target.value as ClientRole)
                    }
                    bg="bg.canvas"
                    borderColor="border.default"
                    color="text.primary"
                    fontSize="sm"
                    _focus={{ borderColor: "accent.solid", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.28)" }}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="pad">Pad</option>
                    <option value="operator">Operator</option>
                    <option value="admin">Admin</option>
                  </NativeSelect.Field>
                </NativeSelect.Root>

                {/* Role description */}
                <Text fontSize="xs" color="text.muted" mt={1.5}>
                  {ROLE_DESCRIPTIONS[selectedRole]}
                </Text>

                {/* Inline error (non-admin) */}
                {inlineError && selectedRole !== "admin" && (
                  <Text fontSize="xs" color="fault" mt={1.5}>
                    {inlineError}
                  </Text>
                )}
              </Box>

              {/* Admin password (only when admin selected) */}
              {selectedRole === "admin" && (
                <Box>
                  <Text
                    fontSize="xs"
                    color="text.muted"
                    mb={1}
                    fontWeight="500"
                  >
                    Admin password
                  </Text>
                  <Input
                    type="password"
                    size="sm"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setInlineError(null);
                    }}
                    placeholder="Enter admin password"
                    bg="bg.surface"
                    borderColor="border.default"
                    color="text.primary"
                    _placeholder={{ color: "text.muted" }}
                    _focus={{ borderColor: "accent.solid", boxShadow: "none" }}
                    autoComplete="current-password"
                  />
                  {/* Inline error (admin) */}
                  {inlineError && (
                    <Text fontSize="xs" color="fault" mt={1.5}>
                      {inlineError}
                    </Text>
                  )}
                </Box>
              )}

              {/* Not-connected notice */}
              {notConnected && (
                <Text fontSize="xs" color="text.muted" fontStyle="italic">
                  Not connected.
                </Text>
              )}
            </Dialog.Body>

            {/* Footer */}
            <Dialog.Footer pt={2} gap={2}>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                color="text.muted"
                _hover={{ color: "text.primary" }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                bg="accent.solid"
                color="white"
                _hover={{ opacity: 0.85 }}
                _active={{ opacity: 0.7 }}
                onClick={handleSubmit}
                disabled={isPending || notConnected}
                loading={isPending}
              >
                Request Role
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
