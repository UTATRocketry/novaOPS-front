"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { Card, Chip, Icon, Mono } from "@/components/primitives";
import { SELECT_STYLE } from "@/components/console/controlStyles";
import { useDataFiles } from "@/hooks";
import { useNovaStore, sel } from "@/lib/store";
import { DATA_SOURCES, SOURCE_LABEL, detectSourceFromName } from "@/lib/analysis";
import type { DataSource } from "@/lib/analysis";
import type { LoadedFile } from "@/hooks/useAnalysisSession";
import { MiniButton } from "./controls";

const NativeSelect = chakra("select");
const NativeInput = chakra("input");

const SOURCE_STATUS: Record<DataSource, "nominal" | "warn" | "info"> = {
  GCS: "nominal",
  TCS: "warn",
  FAS: "info",
};

export interface SourceCardProps {
  files: LoadedFile[];
  loading: boolean;
  error: string | null;
  onLoadBackendFile: (fileName: string, source?: DataSource) => void;
  onLoadLocalFile: (file: File, source?: DataSource) => void;
  onSetFileSource: (id: string, source: DataSource) => void;
  onRemoveFile: (id: string) => void;
  onClear: () => void;
}

/**
 * One loaded file, with its subsystem shown as an editable control.
 *
 * The subsystem is the one fact that cannot be read back out of the CSV — a
 * novaGround and a novaThermo sensor log are byte-for-byte the same shape — so
 * it is always visible and always correctable, and a guessed value is marked.
 */
function FileRow({
  file,
  onSetSource,
  onRemove,
}: {
  file: LoadedFile;
  onSetSource: (source: DataSource) => void;
  onRemove: () => void;
}) {
  return (
    <Flex
      align="center"
      gap={2}
      py={1.5}
      borderBottom="1px solid"
      borderColor="border.default"
      _last={{ borderBottom: "none" }}
    >
      <Icon
        name={file.slot === "actuators" ? "toggle_on" : "sensors"}
        size={15}
        color="var(--chakra-colors-text-muted)"
      />
      <Box flex={1} minW={0}>
        {/* Log filenames run long (`novaGround_2026-06-28-04_data_3_sensors.csv`),
            so the name is clipped with an ellipsis rather than being allowed to
            push the source buttons off the card. `Mono` renders a <span>, which
            text-overflow does not apply to — hence the explicit block display.
            The full name stays available on hover. */}
        <Mono
          display="block"
          fontSize="xs"
          color="text.primary"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
          title={file.name}
        >
          {file.name}
        </Mono>
        <Flex align="center" gap={1.5} mt={0.5} flexWrap="wrap">
          <Mono fontSize="2xs" color="text.muted">
            {file.rowCount.toLocaleString()} × {file.columnCount}
          </Mono>
          <Mono fontSize="2xs" color="text.muted">
            · {file.origin}
          </Mono>
          {file.sourceInferred && (
            <Box title="The filename didn't say which subsystem this is — defaulted. Set it if wrong.">
              <Chip status="warn">
                <Icon name="help" size={10} /> guessed
              </Chip>
            </Box>
          )}
        </Flex>
      </Box>

      <Flex gap={1} flexShrink={0}>
        {DATA_SOURCES.filter((s) => file.slot !== "actuators" || s !== "TCS").map((s) => (
          <MiniButton
            key={s}
            active={file.source === s}
            onClick={() => onSetSource(s)}
            title={SOURCE_LABEL[s]}
          >
            {s}
          </MiniButton>
        ))}
      </Flex>

      <Box
        as="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        color="text.muted"
        cursor="pointer"
        lineHeight={1}
        flexShrink={0}
        _hover={{ color: "fault" }}
      >
        <Icon name="close" size={14} />
      </Box>
    </Flex>
  );
}

/**
 * Chooses what to analyse: CSVs already on the backend, or ones dropped in from
 * the operator's machine. Several logs can be open at once — sensor logs from
 * novaGround / novaThermo / FAS plus the matching actuator logs — and they are
 * folded onto one timeline.
 */
export function SourceCard({
  files,
  loading,
  error,
  onLoadBackendFile,
  onLoadLocalFile,
  onSetFileSource,
  onRemoveFile,
  onClear,
}: SourceCardProps) {
  const clientId = useNovaStore(sel.clientId);
  const { data: backendFiles, refetch, isError: listError } = useDataFiles(
    clientId ?? undefined,
  );
  const [selected, setSelected] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fileList: string[] = backendFiles ?? [];

  // Default to the newest file once the list arrives.
  useEffect(() => {
    if (fileList.length > 0 && !fileList.includes(selected)) {
      setSelected(fileList[fileList.length - 1]);
    }
  }, [fileList, selected]);

  // Preview what the selected filename implies, so a load that will need
  // correcting is visible before it happens rather than after.
  const pendingSource = selected ? detectSourceFromName(selected) : null;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files ?? []);
    dropped.forEach((f) => onLoadLocalFile(f));
  }

  return (
    <Card
      title="Sources"
      headerAction={
        files.length > 0 && (
          <Box
            as="button"
            onClick={onClear}
            fontSize="xs"
            fontFamily="mono"
            color="text.muted"
            cursor="pointer"
            _hover={{ color: "fault" }}
          >
            <Flex align="center" gap={1}>
              <Icon name="close" size={13} /> Clear all
            </Flex>
          </Box>
        )
      }
    >
      <Flex direction="column" gap={3}>
        {/* Backend file picker */}
        <Box>
          <Text fontSize="2xs" color="text.muted" mb={1.5} letterSpacing="0.06em">
            BACKEND DATA FILES
          </Text>
          <Flex gap={2}>
            {/* A native select sizes itself to its longest option, and backend
                log names are long enough to blow out the sidebar. flex+minW=0
                lets it shrink to the available width and clip instead. */}
            <NativeSelect
              flex="1"
              minW={0}
              style={SELECT_STYLE}
              value={selected}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setSelected(e.target.value)
              }
              onFocus={() => refetch()}
            >
              {fileList.length === 0 ? (
                <option value="">
                  {listError ? "Backend unreachable" : "No data files"}
                </option>
              ) : (
                fileList.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))
              )}
            </NativeSelect>
            <Box
              as="button"
              onClick={
                selected && !loading ? () => onLoadBackendFile(selected) : undefined
              }
              aria-disabled={!selected || loading}
              px={3}
              py={1.5}
              flexShrink={0}
              borderRadius="control"
              fontSize="xs"
              fontWeight="600"
              fontFamily="mono"
              border="1px solid"
              borderColor={selected && !loading ? "accent.solid" : "border.default"}
              color={selected && !loading ? "accent.solid" : "text.muted"}
              cursor={selected && !loading ? "pointer" : "not-allowed"}
              _hover={selected && !loading ? { bg: "accent.solid", color: "white" } : {}}
              whiteSpace="nowrap"
            >
              {loading ? "Loading…" : "Load"}
            </Box>
          </Flex>
          {selected && (
            <Flex align="center" gap={1.5} mt={1.5}>
              {pendingSource ? (
                <Chip status={SOURCE_STATUS[pendingSource]}>
                  {SOURCE_LABEL[pendingSource]}
                </Chip>
              ) : (
                <Text fontSize="2xs" color="text.muted">
                  Subsystem not in the filename — set it after loading.
                </Text>
              )}
            </Flex>
          )}
        </Box>

        {/* Local drop zone */}
        <Box
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          border="1px dashed"
          borderColor={dragOver ? "accent.solid" : "border.default"}
          bg={dragOver ? "bg.surfaceRaised" : "transparent"}
          borderRadius="control"
          py={3}
          px={3}
          textAlign="center"
          cursor="pointer"
          transition="all 0.15s"
          _hover={{ borderColor: "accent.solid" }}
        >
          <Flex align="center" justify="center" gap={2} color="text.muted">
            <Icon name="upload_file" size={16} />
            <Text fontSize="xs">Drop CSVs here, or click to browse</Text>
          </Flex>
          <Text fontSize="2xs" color="text.muted" mt={1}>
            Parsed in your browser — nothing is uploaded.
          </Text>
          <NativeInput
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            multiple
            display="none"
            // The programmatic .click() below dispatches a bubbling click that
            // would re-enter the drop zone's onClick and recurse forever.
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              Array.from(e.target.files ?? []).forEach((f) => onLoadLocalFile(f));
              e.target.value = "";
            }}
          />
        </Box>

        {error && (
          <Chip status="fault">
            <Icon name="error" size={13} /> {error}
          </Chip>
        )}

        {/* Loaded files */}
        {files.length > 0 && (
          <Box borderTop="1px solid" borderColor="border.default" pt={1}>
            {files.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                onSetSource={(s) => onSetFileSource(f.id, s)}
                onRemove={() => onRemoveFile(f.id)}
              />
            ))}
          </Box>
        )}
      </Flex>
    </Card>
  );
}
