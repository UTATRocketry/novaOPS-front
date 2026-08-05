"use client";

import { Fragment, useCallback, useState, type ReactNode } from "react";
import { Box, Flex, Table } from "@chakra-ui/react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Card, Icon } from "@/components/primitives";
import { useTableLayout } from "@/hooks/useTableLayout";
import type { LayoutTable } from "@/lib/engine/tableLayout";

// Droppable id for a whole table — lets an *empty* table still accept a drop.
const DROP_PREFIX = "table:";

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------

interface ToolButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  tone?: "default" | "danger";
}

function ToolButton({ icon, label, onClick, active = false, tone = "default" }: ToolButtonProps) {
  const color = tone === "danger" ? "error" : active ? "accent.solid" : "text.muted";
  return (
    <Flex
      as="button"
      onClick={onClick}
      align="center"
      gap={1}
      px={2}
      py={1}
      borderRadius="control"
      border="1px solid"
      borderColor={active ? "accent.solid" : "border.default"}
      bg={active ? "bg.surfaceRaised" : "transparent"}
      color={color}
      fontSize="xs"
      fontWeight="600"
      cursor="pointer"
      transition="all 0.12s"
      _hover={{ bg: "bg.surfaceRaised", color: tone === "danger" ? "error" : "text.primary" }}
    >
      <Icon name={icon} size={16} />
      {label}
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// One table card
// ---------------------------------------------------------------------------

interface SectionTableProps {
  table: LayoutTable;
  editing: boolean;
  canRemove: boolean;
  onRemove: (id: string) => void;
  header: ReactNode;
  /** Built per-mode: edit mode adds a leading controls column. */
  colGroup?: (editing: boolean) => ReactNode;
  size: "sm" | "md" | "lg";
  emptyMessage: string;
  children: ReactNode;
}

function SectionTable({
  table,
  editing,
  canRemove,
  onRemove,
  header,
  colGroup,
  size,
  emptyMessage,
  children,
}: SectionTableProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `${DROP_PREFIX}${table.id}` });

  return (
    <Box flex="1" minW="280px">
      <Card
        title={table.title}
        flush
        headerAction={
          editing && canRemove ? (
            <ToolButton
              icon="close"
              label="Remove"
              onClick={() => onRemove(table.id)}
              tone="danger"
            />
          ) : undefined
        }
      >
        <Box
          ref={setNodeRef}
          overflowX="auto"
          bg={isOver && editing ? "bg.surfaceRaised" : undefined}
          transition="background-color 0.12s"
        >
          {table.names.length === 0 ? (
            <Box px={4} py={6} color="text.muted" fontSize="sm" textAlign="center">
              {editing ? "Drag rows here" : emptyMessage}
            </Box>
          ) : (
            <Table.Root size={size}>
              {colGroup?.(editing)}
              <Table.Header>
                <Table.Row>
                  {editing && <Table.ColumnHeader w="1%" px={2} />}
                  {header}
                </Table.Row>
              </Table.Header>
              <Table.Body>{children}</Table.Body>
            </Table.Root>
          )}
        </Box>
      </Card>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// TableSection
// ---------------------------------------------------------------------------

export interface RowRenderOpts {
  editing: boolean;
  hidden: boolean;
  onToggleHidden: (name: string) => void;
}

export interface TableSectionProps<T> {
  /** localStorage key — one per section, so sensors/actuators customise apart. */
  storageKey: string;
  /** Title of the first table; added tables get "<base> 2", "<base> 3"… */
  baseTitle: string;
  /** Config entries, in config order. */
  items: T[];
  getName: (item: T) => string;
  /** Header cells, excluding the edit-controls column. */
  header: ReactNode;
  colGroup?: (editing: boolean) => ReactNode;
  size?: "sm" | "md" | "lg";
  /** Shown when the section has no config entries at all. */
  emptyMessage: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  renderRow: (item: T, opts: RowRenderOpts) => ReactNode;
}

export function TableSection<T>({
  storageKey,
  baseTitle,
  items,
  getName,
  header,
  colGroup,
  size = "lg",
  emptyMessage,
  editing,
  onEditingChange,
  renderRow,
}: TableSectionProps<T>) {
  const names = items.map(getName);
  const layout = useTableLayout(storageKey, names, baseTitle);
  const { tables, hidden, hiddenCount, setTables } = layout;

  const byName = new Map(items.map((i) => [getName(i), i]));

  // The sensor list must keep a constant length — DndContext uses it directly
  // as a useEffect dependency array. Edit mode is gated on each row instead,
  // via `useSortable({ disabled })` in EditableRow.
  const dragSensors = useSensors(
    // A small activation distance keeps the hide button clickable — a click
    // isn't swallowed as the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // The row currently under the cursor, shown in the drag overlay. Rows no
  // longer relocate mid-drag, so the overlay is what tells you what you're
  // holding.
  const [draggingName, setDraggingName] = useState<string | null>(null);

  /** Which table holds a dnd id (a row name, or a table's own droppable id). */
  const tableIdOf = useCallback(
    (id: string): string | null => {
      if (id.startsWith(DROP_PREFIX)) return id.slice(DROP_PREFIX.length);
      return tables.find((t) => t.names.includes(id))?.id ?? null;
    },
    [tables],
  );

  /**
   * All reordering happens on drop, never on drag-over.
   *
   * Moving rows during `onDragOver` reads better in theory, but with tables
   * laid out side by side it oscillates: relocating the row changes the rects,
   * which changes which rect is "closest", which moves the row back. Each
   * bounce is a synchronous state update, so it never settles. Committing once
   * on drop is the only version that can't feed itself.
   */
  function handleDragStart(event: DragStartEvent) {
    setDraggingName(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingName(null);
    const { active, over } = event;
    if (!over) return; // dropped outside every table — leave the layout alone

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const from = tableIdOf(activeId);
    const to = tableIdOf(overId);
    if (!from || !to) return;

    if (from === to) {
      const table = tables.find((t) => t.id === from);
      if (!table) return;
      const oldIndex = table.names.indexOf(activeId);
      const newIndex = overId.startsWith(DROP_PREFIX)
        ? table.names.length - 1
        : table.names.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      setTables(
        tables.map((t) =>
          t.id === from ? { ...t, names: arrayMove(t.names, oldIndex, newIndex) } : t,
        ),
      );
      return;
    }

    // Cross-table: drop the row from its old table and splice it into the new
    // one at the position it was released over. Every table is copied so
    // nothing in the current layout is mutated in place.
    const next = tables.map((t) => ({ ...t, names: t.names.filter((n) => n !== activeId) }));
    const dest = next.find((t) => t.id === to);
    if (!dest) return;
    const at = overId.startsWith(DROP_PREFIX) ? dest.names.length : dest.names.indexOf(overId);
    dest.names.splice(at < 0 ? dest.names.length : at, 0, activeId);
    setTables(next);
  }

  if (items.length === 0) {
    return (
      <Box flex="1" minW="280px">
        <Card title={baseTitle} flush>
          <Box px={4} py={3} color="text.muted" fontSize={size}>
            {emptyMessage}
          </Box>
        </Card>
      </Box>
    );
  }

  const grid = (
    <Flex gap={4} align="flex-start" flexWrap="wrap" w="100%">
      {tables.map((t) => (
        <SectionTable
          key={t.id}
          table={t}
          editing={editing}
          canRemove={tables.length > 1}
          onRemove={layout.removeTable}
          header={header}
          colGroup={colGroup}
          size={size}
          emptyMessage={emptyMessage}
        >
          <SortableContext items={t.names} strategy={verticalListSortingStrategy}>
            {t.names.map((name) => {
              const item = byName.get(name);
              if (!item) return null;
              return (
                <Fragment key={name}>
                  {renderRow(item, {
                    editing,
                    hidden: hidden.has(name),
                    onToggleHidden: layout.toggleHidden,
                  })}
                </Fragment>
              );
            })}
          </SortableContext>
        </SectionTable>
      ))}
    </Flex>
  );

  return (
    <Box w="100%">
      {/* ── Toolbar ── */}
      <Flex align="center" gap={2} mb={2} flexWrap="wrap">
        <ToolButton
          icon={editing ? "check" : "edit"}
          label={editing ? "Done" : "Edit"}
          active={editing}
          onClick={() => onEditingChange(!editing)}
        />
        {editing && (
          <>
            <ToolButton icon="add" label="Add table" onClick={layout.addTable} />
            <ToolButton icon="restart_alt" label="Clear" onClick={layout.reset} tone="danger" />
          </>
        )}

        {hiddenCount > 0 && (
          <Flex
            as="button"
            onClick={editing ? layout.unhideAll : () => onEditingChange(true)}
            align="center"
            gap={1}
            px={2}
            py={1}
            borderRadius="control"
            border="1px solid"
            borderColor="warn"
            color="warn"
            fontSize="xs"
            fontWeight="700"
            fontFamily="mono"
            cursor="pointer"
            title={editing ? "Show all hidden rows" : "Rows are hidden — click to edit"}
          >
            <Icon name="visibility_off" size={14} />
            {hiddenCount} hidden
          </Flex>
        )}

        {editing && (
          <Box fontSize="xs" color="text.muted" ml={1}>
            Values frozen while editing — commands disabled.
          </Box>
        )}
      </Flex>

      <DndContext
        sensors={dragSensors}
        // `pointerWithin` resolves the drop target from the cursor position
        // rather than from rect proximity, so a row released between two
        // side-by-side tables lands in the one actually under the pointer.
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingName(null)}
      >
        {grid}
        <DragOverlay dropAnimation={null}>
          {draggingName ? (
            <Flex
              align="center"
              gap={2}
              px={3}
              py={1.5}
              bg="bg.surfaceRaised"
              border="1px solid"
              borderColor="accent.solid"
              borderRadius="control"
              boxShadow="md"
              color="text.primary"
              fontFamily="mono"
              fontSize="sm"
            >
              <Icon name="drag_indicator" size={16} />
              {draggingName}
            </Flex>
          ) : null}
        </DragOverlay>
      </DndContext>
    </Box>
  );
}
