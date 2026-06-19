"use client";

import { Box, Button } from "@chakra-ui/react";
import Link from "next/link";
import { PageHeader } from "@/components/shell";
import { ServoTester } from "@/components/tools";

export default function ServoTesterPage() {
  return (
    <Box>
      <PageHeader
        title="Servo Tester"
        subtitle="Direct PWM pulse control — 500–2500 µs"
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href="/tools">← Back to Tools</Link>
          </Button>
        }
      />
      <ServoTester />
    </Box>
  );
}
