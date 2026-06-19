"use client";

import { useEffect, useState } from "react";
import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { Card, Chip, Icon } from "@/components/primitives";
import { useNovaStore, sel } from "@/lib/store";
import { useDataFiles, useDownloadDataFile } from "@/hooks/useDataFiles";
import { ConsoleStream } from "./ConsoleStream";
import { SELECT_STYLE } from "./controlStyles";

const NativeSelect = chakra("select");

const FILE_SELECT_STYLE = { ...SELECT_STYLE, minWidth: "220px" } as const;

/** Trigger a browser download for a fetched CSV blob. */
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

export function LogsViewer() {
  const clientId = useNovaStore(sel.clientId);
  const consoleMessages = useNovaStore(sel.consoleMessages);
  const { data: files, refetch } = useDataFiles(clientId ?? undefined);
  const download = useDownloadDataFile();

  const [selected, setSelected] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState(true);

  const fileList: string[] = files ?? [];

  // Default the selection to the newest file once the list loads.
  useEffect(() => {
    if (fileList.length > 0 && !fileList.includes(selected)) {
      setSelected(fileList[fileList.length - 1]);
    }
  }, [fileList, selected]);

  async function handleDownload() {
    if (!selected) return;
    try {
      const blob = await download.mutateAsync(selected);
      saveBlob(blob, selected);
    } catch {
      // surfaced via download.isError chip
    }
  }

  return (
    <Card
      title="Logs"
      flush
      headerAction={
        <Flex align="center" gap={2} flexWrap="wrap">
          <NativeSelect
            style={FILE_SELECT_STYLE}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            onFocus={() => refetch()}
          >
            {fileList.length === 0 ? (
              <option value="">No data files</option>
            ) : (
              fileList.map((f) => <option key={f} value={f}>{f}</option>)
            )}
          </NativeSelect>

          <Box
            as="button"
            onClick={selected ? handleDownload : undefined}
            aria-disabled={!selected}
            px={3}
            py={1.5}
            borderRadius="control"
            fontSize="xs"
            fontWeight="600"
            border="1px solid"
            borderColor={selected ? "accent.solid" : "border.default"}
            color={selected ? "accent.solid" : "text.muted"}
            cursor={selected ? "pointer" : "not-allowed"}
            _hover={selected ? { bg: "accent.solid", color: "white" } : {}}
          >
            <Flex align="center" gap={1}>
              <Icon name="download" size={14} /> Export CSV
            </Flex>
          </Box>

          <Box
            as="button"
            onClick={() => setAutoScroll((v) => !v)}
            px={3}
            py={1.5}
            borderRadius="control"
            fontSize="xs"
            fontWeight="500"
            border="1px solid"
            borderColor={autoScroll ? "accent.solid" : "border.default"}
            color={autoScroll ? "accent.solid" : "text.muted"}
            cursor="pointer"
            _hover={{ filter: "brightness(1.1)" }}
          >
            <Flex align="center" gap={1}>
              <Icon name={autoScroll ? "vertical_align_bottom" : "pause"} size={14} />
              Auto-scroll {autoScroll ? "on" : "off"}
            </Flex>
          </Box>
        </Flex>
      }
    >
      <Box p={3}>
        {download.isError && (
          <Box mb={2}>
            <Chip status="error">
              {download.error instanceof Error ? download.error.message : "Download failed"}
            </Chip>
          </Box>
        )}
        <ConsoleStream
          entries={consoleMessages}
          height="540px"
          follow={autoScroll}
          emptyMessage="No session output captured yet."
        />
        {fileList.length === 0 && (
          <Text fontSize="xs" color="text.muted" mt={2}>
            No CSV files on the backend yet.
          </Text>
        )}
      </Box>
    </Card>
  );
}
