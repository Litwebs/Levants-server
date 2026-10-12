import { ExternalLink } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { RouteStop } from "@/context/DeliveryRuns/types";

interface Props {
  links: RouteStop["navigationLinks"];
  className?: string;
}

export function NavigationDirections({ links, className }: Props) {
  if (!links) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={className}
          onClick={(event) => event.stopPropagation()}
          title="Choose a navigation app">
          Directions <ExternalLink size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {([
          ["googleMaps", "Google Maps"],
          ["appleMaps", "Apple Maps"],
          ["waze", "Waze"],
        ] as const).map(([key, label]) => (
          <DropdownMenuItem key={key} asChild>
            <a href={links[key]} rel="noopener noreferrer" className="min-h-11">
              {label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
