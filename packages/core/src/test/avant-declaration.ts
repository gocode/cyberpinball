// Références avant déclaration dans le code de haut niveau d'un module (frontend.ts) : une fonction
// fléchée ou une méthode écrite plus haut qui lit une constante (const, let) déclarée plus bas.
// Appelée pendant l'initialisation (un rappel donné à une fabrique qui s'en sert tout de suite),
// elle lève une erreur de « zone morte » en développement et lit `undefined` sans bruit dans
// l'application assemblée par esbuild (const devenu var) : la télécommande ne démarrait plus sur
// la borne d'un joueur dont un téléphone était gardé (0.1.9-essai.66, socialFirewall).
//
// Les fonctions déclarées (`function f() {}`) ne sont pas suivies : elles servent après coup, et
// leur corps est relu au premier appel ; c'est l'ordre des fermetures données pendant
// l'initialisation qui compte ici.

import * as fs from 'node:fs';
import ts from 'typescript';

export interface EarlyReference {
  /** La constante lue avant sa déclaration. */
  name: string;
  /** Ligne de la lecture, et de la déclaration (1 pour la première). */
  line: number;
  declared: number;
}

export function earlyReferences(file: string): EarlyReference[] {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lineOf = (pos: number) => source.getLineAndCharacterOfPosition(pos).line + 1;
  // Les constantes de haut niveau et l'endroit de leur déclaration.
  const declared = new Map<string, number>();
  for (const st of source.statements) {
    if (!ts.isVariableStatement(st)) continue;
    if (!(st.declarationList.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let))) continue;
    for (const d of st.declarationList.declarations) {
      const names: string[] = [];
      const collect = (n: ts.BindingName) => {
        if (ts.isIdentifier(n)) names.push(n.text);
        else for (const e of n.elements) if (!ts.isOmittedExpression(e)) collect(e.name);
      };
      collect(d.name);
      for (const name of names) if (!declared.has(name)) declared.set(name, d.getStart(source));
    }
  }
  const found: EarlyReference[] = [];
  const seen = new Set<string>();
  // Dans chaque instruction de haut niveau qui n'est pas une fonction déclarée : les lectures, à
  // l'intérieur d'une fonction fléchée, d'une fonction anonyme ou d'une méthode, d'une constante
  // déclarée plus bas. Une lecture directe (hors fonction) est déjà refusée par TypeScript.
  for (const st of source.statements) {
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isImportDeclaration(st)) continue;
    const walk = (node: ts.Node, inClosure: boolean, shadowed: ReadonlySet<string>) => {
      const closure = inClosure || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);
      let shadow = shadowed;
      // Un paramètre ou une variable locale du même nom masque la constante.
      if (ts.isFunctionLike(node)) {
        const local = new Set(shadowed);
        for (const p of node.parameters) if (ts.isIdentifier(p.name)) local.add(p.name.text);
        shadow = local;
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && inClosure) (shadow as Set<string>).add?.(node.name.text);
      if (closure && ts.isIdentifier(node) && declared.has(node.text) && !shadow.has(node.text)) {
        const parent = node.parent;
        const isProperty = (ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isPropertyAssignment(parent) && parent.name === node) || (ts.isPropertySignature(parent) && parent.name === node) || ts.isTypeReferenceNode(parent);
        const at = declared.get(node.text)!;
        if (!isProperty && node.getStart(source) < at) {
          const key = `${node.text}:${lineOf(node.getStart(source))}`;
          if (!seen.has(key)) {
            seen.add(key);
            found.push({ name: node.text, line: lineOf(node.getStart(source)), declared: lineOf(at) });
          }
        }
      }
      ts.forEachChild(node, (child) => walk(child, closure, shadow));
    };
    walk(st, false, new Set());
  }
  return found;
}
