"use client";

import { Box, type BoxProps } from "@chakra-ui/react";

export interface IconProps extends Omit<BoxProps, "children" | "fill" | "fontWeight"> {
  /** Material Symbols (rounded) ligature name, e.g. "rocket_launch". */
  name: string;
  /** Optical size in px (also drives font-size). */
  size?: number;
  /** 0 = outlined, 1 = filled. */
  fill?: 0 | 1;
  /** Stroke weight 100–700. */
  weight?: number;
}

/**
 * Single wrapper for every icon in the app. Centralizes Material Symbols
 * variation settings so fill/weight/grade is controlled in one place.
 */
export function Icon({ name, size = 20, fill = 0, weight = 400, ...rest }: IconProps) {
  return (
    <Box
      as="span"
      className="material-symbols-rounded"
      aria-hidden="true"
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      lineHeight="1"
      fontSize={`${size}px`}
      style={{
        fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
      }}
      {...rest}
    >
      {name}
    </Box>
  );
}
