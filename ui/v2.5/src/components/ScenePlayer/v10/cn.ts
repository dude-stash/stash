import classNames from "classnames";
import type { ClassValue } from "cn";

// The cn helper the copied skin imports from @/lib/utils, which shadcn expects each project to provide. Stash has no Tailwind classes to merge, so it only joins them.
export function cn(...inputs: ClassValue[]) {
  return classNames(...(inputs as classNames.ArgumentArray));
}
