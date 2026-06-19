"use client";

import { Box, Flex } from "@chakra-ui/react";
import { Card, Chip, Mono } from "@/components/primitives";
import type { ProcedureEntry } from "@/lib/config";
import { AddRowButton, IconButton, TextCell } from "./fields";

export interface ProceduresTableProps {
  procedures: ProcedureEntry[];
  onChange: (next: ProcedureEntry[]) => void;
}

export function ProceduresTable({ procedures, onChange }: ProceduresTableProps) {
  function updateProc(i: number, patch: Partial<ProcedureEntry>) {
    onChange(procedures.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function removeProc(i: number) {
    onChange(procedures.filter((_, idx) => idx !== i));
  }
  function addProc() {
    onChange([...procedures, { name: "", steps: [] }]);
  }
  function updateStep(pi: number, si: number, text: string) {
    const steps = procedures[pi].steps.map((s, idx) => (idx === si ? text : s));
    updateProc(pi, { steps });
  }
  function removeStep(pi: number, si: number) {
    updateProc(pi, { steps: procedures[pi].steps.filter((_, idx) => idx !== si) });
  }
  function addStep(pi: number) {
    updateProc(pi, { steps: [...procedures[pi].steps, ""] });
  }

  return (
    <Flex direction="column" gap={4}>
      {procedures.length === 0 ? (
        <Card title="Procedures" headerAction={<Chip status="neutral">frontend only</Chip>}>
          <Box color="text.muted" fontSize="sm">No procedures. Add one below.</Box>
        </Card>
      ) : (
        procedures.map((proc, pi) => (
          <Card
            key={pi}
            title={
              <Box maxW="320px">
                <TextCell value={proc.name} onChange={(v) => updateProc(pi, { name: v })} placeholder="Procedure name" mono={false} />
              </Box>
            }
            headerAction={<IconButton icon="delete" label="Remove procedure" tone="fault" onClick={() => removeProc(pi)} />}
          >
            <Flex direction="column" gap={2}>
              {proc.steps.map((step, si) => (
                <Flex key={si} align="center" gap={2}>
                  <Mono fontSize="xs" color="text.muted" w="24px">{si + 1}.</Mono>
                  <Box flex="1">
                    <TextCell value={step} onChange={(v) => updateStep(pi, si, v)} placeholder="Step description" mono={false} />
                  </Box>
                  <IconButton icon="close" label="Remove step" tone="muted" onClick={() => removeStep(pi, si)} />
                </Flex>
              ))}
              <Box>
                <AddRowButton label="Add step" onClick={() => addStep(pi)} />
              </Box>
            </Flex>
          </Card>
        ))
      )}
      <Box>
        <AddRowButton label="Add procedure" onClick={addProc} />
      </Box>
    </Flex>
  );
}
