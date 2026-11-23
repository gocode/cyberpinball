// Un rôle sans écran disponible ne prive pas les suivants de leurs propositions
// (notamment le DMD incrusté dans le playfield d'un PC à un seul écran).
export function nextAssignableRole(after: number, count: number, hasOptions: (index: number) => boolean): number {
  let index = after + 1;
  while (index < count && !hasOptions(index)) index++;
  return index;
}
