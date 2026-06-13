"use client";

/**
 * UploadConfigModal — lets the operator upload a YAML config file to the
 * backend (POST /api/config/upload). On success the TanStack Query cache is
 * invalidated (config + sensors + actuators) so the next WebSocket snapshot
 * reconciles state.
 */
import { useRef, useState, useCallback } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { Card, Chip, Icon } from "@/components/primitives";
import { useUploadConfig } from "@/hooks";

export interface UploadConfigModalProps {
  onClose: () => void;
}

export function UploadConfigModal({ onClose }: UploadConfigModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending, isSuccess } = useUploadConfig();

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError(null);
  }, []);

  const handleUpload = useCallback(() => {
    if (!selectedFile) return;
    setError(null);
    mutate(selectedFile, {
      onError: (err: unknown) => {
        setError(err instanceof Error ? err.message : "Upload failed");
      },
    });
  }, [selectedFile, mutate]);

  return (
    // Overlay
    <Box
      position="fixed"
      inset={0}
      zIndex={1000}
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="blackAlpha.600"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card title="Upload Config" w="440px" maxW="90vw">
        <Flex direction="column" gap={4}>
          {/* Drop / file zone */}
          <Box
            border="1px dashed"
            borderColor={selectedFile ? "accent.solid" : "border.default"}
            borderRadius="card"
            p={6}
            textAlign="center"
            cursor="pointer"
            transition="all 0.15s"
            _hover={{ borderColor: "accent.solid" }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="upload_file" size={32} color="text.muted" />
            <Box fontSize="sm" color="text.primary" mt={2}>
              {selectedFile ? selectedFile.name : "Click to choose a YAML config file"}
            </Box>
            <Box fontSize="xs" color="text.muted" mt={1}>
              {selectedFile
                ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                : ".yaml or .yml"}
            </Box>
          </Box>

          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {/* Status feedback */}
          {error && (
            <Flex align="center" gap={2}>
              <Icon name="error" size={16} color="fault" />
              <Box fontSize="xs" color="fault">{error}</Box>
            </Flex>
          )}
          {isSuccess && (
            <Flex align="center" gap={2}>
              <Icon name="check_circle" size={16} fill={1} color="nominal" />
              <Box fontSize="xs" color="nominal">
                Config uploaded — re-fetching config and waiting for snapshot.
              </Box>
            </Flex>
          )}

          {/* Actions */}
          <Flex justify="flex-end" gap={2}>
            <Box
              as="button"
              onClick={onClose}
              px={3}
              py={1.5}
              fontSize="xs"
              fontFamily="mono"
              borderRadius="control"
              border="1px solid"
              borderColor="border.default"
              bg="transparent"
              color="text.muted"
              cursor="pointer"
              transition="all 0.15s"
              _hover={{ borderColor: "text.primary", color: "text.primary" }}
            >
              {isSuccess ? "Close" : "Cancel"}
            </Box>
            {!isSuccess && (
              <Box
                as="button"
                onClick={handleUpload}
                aria-disabled={!selectedFile || isPending}
                px={3}
                py={1.5}
                fontSize="xs"
                fontFamily="mono"
                fontWeight="600"
                borderRadius="control"
                bg={!selectedFile || isPending ? "bg.surfaceRaised" : "accent.solid"}
                color={!selectedFile || isPending ? "text.muted" : "white"}
                cursor={!selectedFile || isPending ? "not-allowed" : "pointer"}
                opacity={!selectedFile ? 0.5 : 1}
                transition="all 0.15s"
                _hover={!selectedFile || isPending ? {} : { opacity: 0.85 }}
              >
                {isPending ? "Uploading…" : "Upload"}
              </Box>
            )}
          </Flex>
        </Flex>
      </Card>
    </Box>
  );
}
