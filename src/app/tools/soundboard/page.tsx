"use client";

import { Box, Button } from "@chakra-ui/react";
import Link from "next/link";
import { PageHeader } from "@/components/shell";
import { SoundboardTool } from "@/components/tools";

export default function SoundboardPage() {
  return (
    <Box>
      <PageHeader
        title="Soundboard"
        subtitle="FMC soundboard — play stored clips, generate tones, manage flash"
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href="/tools">← Back to Tools</Link>
          </Button>
        }
      />
      <SoundboardTool />
    </Box>
  );
}
