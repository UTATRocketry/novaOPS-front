"use client";

import { Button } from "@chakra-ui/react";
import { HomeButton, StatusPage } from "@/components/shell/StatusPage";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <StatusPage
      icon="error_outline"
      iconColor="fault"
      code="500"
      title="Something went wrong"
      description={error.message || "An unexpected error occurred. The team has been notified."}
    >
      <Button
        size="sm"
        variant="outline"
        borderColor="border.default"
        color="text.muted"
        _hover={{ color: "text.primary" }}
        onClick={reset}
      >
        Try again
      </Button>
      <HomeButton />
    </StatusPage>
  );
}
