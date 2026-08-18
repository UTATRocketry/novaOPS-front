"use client";

import { Box, Button } from "@chakra-ui/react";
import Link from "next/link";
import { PageHeader } from "@/components/shell";
import { RadioConfigView } from "@/components/tools";

export default function RadioConfigPage() {
  return (
    <Box>
      <PageHeader
        title="Vehicle Radio"
        subtitle="STM32WL configuration record — LoRa link, pressure streams, RF chain"
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href="/tools">← Back to Tools</Link>
          </Button>
        }
      />
      <RadioConfigView />
    </Box>
  );
}
