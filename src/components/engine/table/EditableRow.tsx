"use client";

import type { ReactNode } from "react";
import { Box, Flex, Table, Tooltip } from "@chakra-ui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@/components/primitives";

export interface EditableRowProps {
  /** Row name — doubles as the dnd sortable id (names are unique in config). */
  id: string;
  editing: boolean;
  hidden: boolean;
  onToggleHidden: (name: string) => void;
  /** Content cells. The edit-controls cell is prepended by this component. */
  children: ReactNode;
}

/**
 * A table row that becomes draggable + hideable in edit mode.
 *
 * Outside edit mode this is a plain `<Table.Row>` with no dnd wiring at all —
 * the live tables stay as light as they were before customisation existed.
 */
export function EditableRow({ id, editing, hidden, onToggleHidden, children }: EditableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editing,
  });

  // Hidden rows are only rendered while editing — that's the one place an
  // operator can see and undo what they've hidden.
  if (hidden && !editing) return null;

  return (
    <Table.Row
      ref={editing ? setNodeRef : undefined}
      style={
        editing
          ? { transform: CSS.Transform.toString(transform), transition }
          : undefined
      }
      opacity={isDragging ? 0.35 : hidden ? 0.4 : 1}
      bg={isDragging ? "bg.surfaceRaised" : undefined}
      position="relative"
      zIndex={isDragging ? 1 : undefined}
      transition="background-color 0.12s"
      _hover={{ bg: "bg.surfaceRaised" }}
    >
      {editing && (
        <Table.Cell w="1%" px={2}>
          <Flex gap={1} align="center">
            <Box
              as="span"
              display="inline-flex"
              alignItems="center"
              color="text.muted"
              cursor="grab"
              _active={{ cursor: "grabbing" }}
              aria-label={`Reorder ${id}`}
              {...attributes}
              {...listeners}
            >
              <Icon name="drag_indicator" size={18} />
            </Box>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <Box
                  as="button"
                  display="inline-flex"
                  alignItems="center"
                  color={hidden ? "text.muted" : "text.primary"}
                  cursor="pointer"
                  onClick={() => onToggleHidden(id)}
                  aria-label={hidden ? `Show ${id}` : `Hide ${id}`}
                  aria-pressed={hidden}
                  _hover={{ color: "text.primary" }}
                >
                  <Icon name={hidden ? "visibility_off" : "visibility"} size={18} />
                </Box>
              </Tooltip.Trigger>
              <Tooltip.Content>{hidden ? "Show row" : "Hide row"}</Tooltip.Content>
            </Tooltip.Root>
          </Flex>
        </Table.Cell>
      )}
      {children}
    </Table.Row>
  );
}
