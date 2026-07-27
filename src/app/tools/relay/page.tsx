"use client";

import { Box, Button } from "@chakra-ui/react";
import Link from "next/link";
import { PageHeader } from "@/components/shell";
import { RelayTester } from "@/components/tools";

export default function RelayTesterPage() {
  return (
    <Box>
      <PageHeader
        title="Relay Tester"
        subtitle="Direct relay/load-switch control — on / off / pulse / blink"
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href="/tools">← Back to Tools</Link>
          </Button>
        }
      />
      <RelayTester />
    </Box>
  );
}
