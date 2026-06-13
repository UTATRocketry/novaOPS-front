"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { downloadDataFile, getDataFiles, uploadDataFile } from "@/lib/api";
import { queryKeys } from "./queryKeys";

export function useDataFiles(clientId?: string) {
  return useQuery({
    queryKey: queryKeys.dataFiles,
    queryFn: () => getDataFiles(clientId),
  });
}

export function useDownloadDataFile() {
  return useMutation({
    mutationFn: (fileName: string) => downloadDataFile(fileName),
  });
}

export function useUploadDataFile() {
  return useMutation({
    mutationFn: (file: File) => uploadDataFile(file),
  });
}
