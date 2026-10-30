/** Three-way comparison of two strings or two numbers in ascending order: negative, 0 or positive. */
export const compareAsc = <T extends string | number>(a: T, b: T): number => (a < b ? -1 : a > b ? 1 : 0)
