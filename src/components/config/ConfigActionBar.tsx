"use client";

import { useRef, useState } from "react";
import { Box, Flex, Input, Spinner, Text, chakra } from "@chakra-ui/react";
import { Chip, Icon } from "@/components/primitives";
import { useConfigList, useLoadConfig, useUploadConfig } from "@/hooks/useConfig";
import { downloadConfigFile } from "@/lib/api";

const NativeSelect = chakra("select");

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface ActionButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  busy?: boolean;
}

function ActionButton({ icon, label, onClick, disabled, primary, busy }: ActionButtonProps) {
  return (
    <Flex
      as="button"
      align="center"
      gap={1.5}
      onClick={disabled || busy ? undefined : onClick}
      aria-disabled={disabled || busy}
      px={3}
      py={1.5}
      borderRadius="control"
      fontSize="xs"
      fontWeight="600"
      bg={primary && !disabled ? "accent.solid" : "bg.surface"}
      color={primary && !disabled ? "white" : disabled ? "text.muted" : "text.primary"}
      border="1px solid"
      borderColor={primary && !disabled ? "accent.solid" : "border.default"}
      cursor={disabled || busy ? "not-allowed" : "pointer"}
      opacity={disabled ? 0.5 : 1}
      _hover={disabled || busy ? {} : { filter: "brightness(1.1)" }}
    >
      {busy ? <Spinner size="xs" /> : <Icon name={icon} size={15} />}
      {label}
    </Flex>
  );
}

export interface ConfigActionBarProps {
  /** Page-owned save (validate + PUT/PATCH, or upload when creating). */
  onUpdate: () => void;
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  saveOk: boolean;
  validationErrorCount: number;
  /** Non-null while authoring a new config file. */
  creatingName: string | null;
  onNew: () => void;
  onCreateNameChange: (v: string) => void;
  onCancelNew: () => void;
}

export function ConfigActionBar({
  onUpdate,
  isDirty,
  isSaving,
  saveError,
  saveOk,
  validationErrorCount,
  creatingName,
  onNew,
  onCreateNameChange,
  onCancelNew,
}: ConfigActionBarProps) {
  const { data: files, refetch, isFetching } = useConfigList();
  const load = useLoadConfig();
  const upload = useUploadConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const fileList: string[] = files ?? [];

  async function handleDownload() {
    if (!selected) return;
    setActionError(null);
    try {
      const blob = await downloadConfigFile(selected);
      saveBlob(blob, selected);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Download failed");
    }
  }

  function handleLoad() {
    if (!selected) return;
    setActionError(null);
    load.mutate(selected, {
      onError: (err: unknown) => setActionError(err instanceof Error ? err.message : "Load failed"),
    });
  }

  function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setActionError(null);
    upload.mutate(file, {
      onError: (err: unknown) => setActionError(err instanceof Error ? err.message : "Upload failed"),
      onSettled: () => { if (fileInputRef.current) fileInputRef.current.value = ""; },
    });
  }

  const canUpdate = isDirty && validationErrorCount === 0 && !isSaving;

  return (
    <Flex direction="column" gap={2} mb={4}>
      <Flex align="center" gap={2} flexWrap="wrap">
        {/* File dropdown */}
        <NativeSelect
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          onFocus={() => refetch()}
          bg="bg.canvas"
          borderWidth="1px"
          borderColor="border.default"
          borderRadius="control"
          fontSize="sm"
          fontFamily="mono"
          px={2}
          py={1.5}
          minW="220px"
          color="text.primary"
          cursor="pointer"
        >
          <option value="">{isFetching ? "Loading files…" : "Select config file…"}</option>
          {fileList.map((f) => <option key={f} value={f}>{f}</option>)}
        </NativeSelect>

        <ActionButton icon="folder_open" label="Load" onClick={handleLoad} disabled={!selected || creatingName !== null} busy={load.isPending} />
        <ActionButton icon="download" label="Download" onClick={handleDownload} disabled={!selected || creatingName !== null} />
        <ActionButton icon="upload_file" label="Upload" onClick={() => fileInputRef.current?.click()} busy={upload.isPending} />
        <ActionButton icon="note_add" label="New" onClick={onNew} disabled={creatingName !== null} />

        <Box flex="1" />

        {creatingName !== null ? (
          <>
            <Input
              size="sm"
              value={creatingName}
              onChange={(e) => onCreateNameChange(e.target.value)}
              placeholder="filename.yaml"
              fontFamily="mono"
              bg="bg.canvas"
              borderColor="border.default"
              maxW="200px"
              _focusVisible={{ borderColor: "accent.solid" }}
            />
            <ActionButton icon="close" label="Cancel" onClick={onCancelNew} />
            <ActionButton
              icon="add_circle"
              label="Create"
              primary
              onClick={onUpdate}
              disabled={!canUpdate}
              busy={isSaving}
            />
          </>
        ) : (
          <>
            {isDirty && <Chip status="warn">unsaved changes</Chip>}
            <ActionButton
              icon="save"
              label="Update"
              primary
              onClick={onUpdate}
              disabled={!canUpdate}
              busy={isSaving}
            />
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml"
          style={{ display: "none" }}
          onChange={handleUploadFile}
        />
      </Flex>

      {/* Status line */}
      {(validationErrorCount > 0 || saveError || actionError || saveOk || upload.isSuccess || load.isSuccess) && (
        <Flex align="center" gap={2} flexWrap="wrap">
          {validationErrorCount > 0 && (
            <Chip status="fault">{validationErrorCount} validation error{validationErrorCount > 1 ? "s" : ""}</Chip>
          )}
          {saveError && <Chip status="fault">{saveError}</Chip>}
          {actionError && <Chip status="fault">{actionError}</Chip>}
          {saveOk && !isDirty && (
            <Flex align="center" gap={1}>
              <Icon name="check_circle" size={14} fill={1} color="nominal" />
              <Text fontSize="xs" color="nominal">Saved &amp; re-fetched.</Text>
            </Flex>
          )}
          {upload.isSuccess && <Text fontSize="xs" color="nominal">Config uploaded.</Text>}
          {load.isSuccess && <Text fontSize="xs" color="nominal">Config loaded.</Text>}
        </Flex>
      )}
    </Flex>
  );
}
