"use client";

import { Box, Button } from "@chakra-ui/react";
import Link from "next/link";
import { PageHeader } from "@/components/shell";
import { BuzzerTool } from "@/components/tools";

export default function BuzzerPage() {
  return (
    <Box>
      <PageHeader
        title="Buzzer / Melody"
        subtitle="FMC buzzer control — play predefined or custom melodies"
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href="/tools">← Back to Tools</Link>
          </Button>
        }
      />
      <BuzzerTool />
    </Box>
  );
}
