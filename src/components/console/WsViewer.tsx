"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Box, Flex, Text, Button, Input, NativeSelect } from "@chakra-ui/react";
import { useNovaStore, sel } from "@/lib/store";
import {
  getMqttTopics,
  subscribeMqttTopic,
  unsubscribeMqttTopic,
} from "@/lib/api";
import { INPUT_PROPS } from "./controlStyles";

// ---------------------------------------------------------------------------
// WebSocket URL (mirrors NovaSocket.buildUrl)
// ---------------------------------------------------------------------------

function buildWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8000/ws?role=viewer";
  const base =
    process.env.NEXT_PUBLIC_NOVA_WS_BASE_URL ??
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
  return `${base}/ws?role=viewer`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WsStatus = "connecting" | "connected" | "disconnected" | "error";
type ViewerMode = "types" | "topics";

interface Column {
  id: number;
  filter: string;
}

const MAX_COLUMNS = 3;
const RECONNECT_INTERVAL_MS = 2_000;
const MAX_RECONNECT = 10;

let colIdCounter = 0;
function nextId() {
  return ++colIdCounter;
}

// ---------------------------------------------------------------------------
// WsViewer
// ---------------------------------------------------------------------------

export function WsViewer() {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [mode, setMode] = useState<ViewerMode>("types");

  // Latest snapshot per type / per topic
  const [latestByType, setLatestByType] = useState<Record<string, unknown>>({});
  const [latestByTopic, setLatestByTopic] = useState<Record<string, unknown>>({});
  const [latestAny, setLatestAny] = useState<unknown>(null);
  const [seenTypes, setSeenTypes] = useState<string[]>([]);
  const [seenTopics, setSeenTopics] = useState<string[]>([]);

  // Ad-hoc backend subscriptions (see /api/mqtt/topics)
  const clientId = useNovaStore(sel.clientId);
  const role = useNovaStore(sel.sessionRole);
  const canSubscribe = (role === "operator" || role === "admin") && !!clientId;
  const [subscribed, setSubscribed] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMqttTopics()
      .then((r) => {
        if (!cancelled) setSubscribed(r.topics);
      })
      .catch(() => {
        // list is informational; leave it empty if the backend is unreachable
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeSubscription = async (action: "add" | "remove", topic: string) => {
    if (!clientId || !topic || subBusy) return;
    setSubBusy(true);
    setSubError(null);
    try {
      const r =
        action === "add"
          ? await subscribeMqttTopic(topic, clientId)
          : await unsubscribeMqttTopic(topic, clientId);
      setSubscribed(r.topics);
      if (action === "add") setTopicInput("");
    } catch (err) {
      setSubError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubBusy(false);
    }
  };

  const [columns, setColumns] = useState<Column[]>([{ id: nextId(), filter: "" }]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const destroyed = useRef(false);

  const connect = useCallback(() => {
    if (destroyed.current) return;
    setStatus("connecting");
    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      attemptRef.current = 0;
      setReconnectAttempt(0);
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as Record<string, unknown>;
        const type = typeof msg.type === "string" ? msg.type : undefined;

        setLatestAny(msg);

        if (type) {
          setLatestByType((prev) => ({ ...prev, [type]: msg }));
          setSeenTypes((prev) =>
            prev.includes(type) ? prev : [...prev, type].sort(),
          );
        }

        if (type === "mqtt_message") {
          const topic = typeof msg.topic === "string" ? msg.topic : undefined;
          if (topic) {
            setLatestByTopic((prev) => ({ ...prev, [topic]: msg }));
            setSeenTopics((prev) =>
              prev.includes(topic) ? prev : [...prev, topic].sort(),
            );
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => setStatus("error");

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;
      if (destroyed.current) return;
      if (attemptRef.current < MAX_RECONNECT) {
        attemptRef.current++;
        setReconnectAttempt(attemptRef.current);
        reconnectTimer.current = setTimeout(connect, RECONNECT_INTERVAL_MS);
      }
    };
  }, []);

  useEffect(() => {
    destroyed.current = false;
    connect();
    return () => {
      destroyed.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Column helpers
  const addColumn = () => {
    if (columns.length >= MAX_COLUMNS) return;
    setColumns((prev) => [...prev, { id: nextId(), filter: "" }]);
  };

  const removeColumn = (id: number) => {
    setColumns((prev) => prev.filter((c) => c.id !== id));
  };

  const setColumnFilter = (id: number, filter: string) => {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, filter } : c)));
  };

  const filterOptions =
    mode === "types"
      ? seenTypes
      : [...seenTopics, ...subscribed.filter((t) => !seenTopics.includes(t))];

  function columnData(col: Column): unknown {
    if (mode === "types") {
      return col.filter === "" ? latestAny : latestByType[col.filter] ?? null;
    }
    return col.filter === "" ? latestAny : latestByTopic[col.filter] ?? null;
  }

  const statusColor: Record<WsStatus, string> = {
    connected: "green.500",
    connecting: "yellow.400",
    disconnected: "orange.400",
    error: "red.500",
  };

  return (
    <Box>
      {/* Toolbar */}
      <Flex align="center" gap={3} mb={4} wrap="wrap">
        <Flex align="center" gap={1.5}>
          <Box w={2} h={2} borderRadius="full" bg={statusColor[status]} />
          <Text fontSize="xs" color="text.muted" textTransform="capitalize">
            {status}
            {status === "disconnected" && reconnectAttempt > 0
              ? ` (attempt ${reconnectAttempt}/${MAX_RECONNECT})`
              : ""}
          </Text>
        </Flex>

        {/* Mode toggle */}
        <Flex
          bg="bg.surfaceRaised"
          border="1px solid"
          borderColor="border.default"
          borderRadius="control"
          overflow="hidden"
        >
          {(["types", "topics"] as ViewerMode[]).map((m) => (
            <Box
              key={m}
              as="button"
              px={3}
              py={1}
              fontSize="xs"
              fontWeight={mode === m ? "600" : "400"}
              color={mode === m ? "white" : "text.muted"}
              bg={mode === m ? "accent.solid" : "transparent"}
              border="none"
              cursor="pointer"
              onClick={() => setMode(m)}
              style={{ transition: "background 120ms" }}
              textTransform="capitalize"
            >
              {m === "types" ? "WS Types" : "MQTT Topics"}
            </Box>
          ))}
        </Flex>

        <Button
          size="xs"
          variant="outline"
          onClick={addColumn}
          disabled={columns.length >= MAX_COLUMNS}
        >
          + Add column
        </Button>
      </Flex>

      {/* Extra MQTT topic subscriptions */}
      <Box
        mb={4}
        p={3}
        border="1px solid"
        borderColor="border.default"
        borderRadius="card"
        bg="bg.surface"
      >
        <Text fontSize="xs" color="text.muted" mb={2}>
          Extra MQTT topics
        </Text>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void changeSubscription("add", topicInput.trim());
          }}
        >
          <Flex gap={2} align="center">
            <Input
              {...INPUT_PROPS}
              size="xs"
              fontFamily="mono"
              placeholder="nova/stats/#"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              disabled={!canSubscribe || subBusy}
            />
            <Button
              type="submit"
              size="xs"
              variant="outline"
              disabled={!canSubscribe || subBusy || topicInput.trim() === ""}
            >
              Subscribe
            </Button>
          </Flex>
        </form>
        {!canSubscribe && (
          <Text fontSize="xs" color="text.muted" mt={2}>
            Operator or admin role required to change subscriptions.
          </Text>
        )}
        {subError && (
          <Text fontSize="xs" color="red.400" mt={2}>
            {subError}
          </Text>
        )}
        {subscribed.length > 0 && (
          <Flex gap={2} mt={2} wrap="wrap">
            {subscribed.map((t) => (
              <Flex
                key={t}
                align="center"
                gap={1.5}
                px={2}
                py={0.5}
                border="1px solid"
                borderColor="border.default"
                borderRadius="control"
                fontFamily="mono"
                fontSize="xs"
              >
                {t}
                {canSubscribe && (
                  <Box
                    as="button"
                    onClick={() => void changeSubscription("remove", t)}
                    bg="transparent"
                    border="none"
                    cursor="pointer"
                    color="text.muted"
                    _hover={{ color: "red.400" }}
                    title={`Unsubscribe from ${t}`}
                  >
                    ✕
                  </Box>
                )}
              </Flex>
            ))}
          </Flex>
        )}
      </Box>

      {/* Columns */}
      <Flex gap={3} align="stretch" minH="320px">
        {columns.map((col) => {
          const data = columnData(col);
          return (
            <Box
              key={col.id}
              flex="1"
              minW="0"
              display="flex"
              flexDirection="column"
              border="1px solid"
              borderColor="border.default"
              borderRadius="card"
              overflow="hidden"
            >
              {/* Column header */}
              <Flex
                align="center"
                gap={2}
                px={3}
                py={2}
                bg="bg.surface"
                borderBottom="1px solid"
                borderColor="border.default"
                flexShrink={0}
              >
                <Text fontSize="xs" color="text.muted" flexShrink={0}>
                  {mode === "types" ? "Type:" : "Topic:"}
                </Text>
                <NativeSelect.Root size="xs" flex="1">
                  <NativeSelect.Field
                    value={col.filter}
                    onChange={(e) => setColumnFilter(col.id, e.target.value)}
                    fontFamily="mono"
                  >
                    <option value="">
                      {mode === "types" ? "All types" : "All topics"}
                    </option>
                    {filterOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
                {columns.length > 1 && (
                  <Box
                    as="button"
                    onClick={() => removeColumn(col.id)}
                    fontSize="xs"
                    color="text.muted"
                    bg="transparent"
                    border="none"
                    cursor="pointer"
                    px={1}
                    _hover={{ color: "red.400" }}
                    title="Remove column"
                  >
                    ✕
                  </Box>
                )}
              </Flex>

              {/* Column data */}
              <Box
                flex="1"
                bg="#0a0e16"
                fontFamily="mono"
                fontSize="xs"
                p={3}
                overflowY="auto"
                color="chrome.text"
                whiteSpace="pre"
              >
                {data == null ? (
                  <Box color="chrome.textMuted">Waiting for data…</Box>
                ) : (
                  JSON.stringify(data, null, 2)
                )}
              </Box>
            </Box>
          );
        })}
      </Flex>
    </Box>
  );
}
