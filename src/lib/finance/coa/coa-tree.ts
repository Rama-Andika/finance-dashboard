import type { AccountGroup, Id } from '../../core/types'

/** Id of the virtual folder that holds accounts whose parent does not exist. Skip it when summing real accounts. */
export const ORPHAN_FOLDER_ID = '__orphans__' as const

export type CoaRow = {
  coaId: Id
  parentId: Id
  code: string
  name: string
  status: 'HEADER' | 'POSTABLE'
  level: number
  accountGroup: AccountGroup
  subAccountGroup: string
  saldoNormal: 'DEBET' | 'CREDIT'
}

export type CoaNode = Omit<CoaRow, 'parentId'> & {
  parentId: Id | null
  children: CoaNode[]
  isOrphan?: boolean
  isCycle?: boolean
}

export type CoaTree = {
  roots: CoaNode[]
  byId: Map<Id, CoaNode>
  orphanFolderId: typeof ORPHAN_FOLDER_ID
}

function compareCoaNodes(a: CoaNode, b: CoaNode): number {
  const codeCmp = a.code.localeCompare(b.code)
  if (codeCmp !== 0) return codeCmp
  return a.coaId.localeCompare(b.coaId)
}

export function buildCoaTree(rows: CoaRow[]): CoaTree {
  const byId = new Map<Id, CoaNode>()

  // Step 1: Create all node objects
  for (const r of rows) {
    const parentId = !r.parentId || r.parentId === '0' ? null : r.parentId
    byId.set(r.coaId, {
      coaId: r.coaId,
      parentId,
      code: r.code,
      name: r.name,
      status: r.status,
      level: r.level,
      accountGroup: r.accountGroup,
      subAccountGroup: r.subAccountGroup,
      saldoNormal: r.saldoNormal,
      children: [],
    })
  }

  // Step 2: Validate parent relationships, detect orphans & cycles
  const orphans: CoaNode[] = []
  const roots: CoaNode[] = []

  for (const node of byId.values()) {
    if (node.parentId === null) {
      roots.push(node)
      continue
    }

    // Check if parent exists
    const parent = byId.get(node.parentId)
    if (!parent) {
      node.isOrphan = true
      orphans.push(node)
      continue
    }

    // Check for cycles by walking upwards
    let current: CoaNode | undefined = parent
    let isCycle = false
    const seen = new Set<Id>([node.coaId])

    while (current) {
      if (seen.has(current.coaId)) {
        isCycle = true
        break
      }
      seen.add(current.coaId)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }

    if (isCycle) {
      node.isCycle = true
      node.isOrphan = true
      orphans.push(node)
    } else {
      parent.children.push(node)
    }
  }

  // Step 3: Sort children of each node
  for (const node of byId.values()) {
    node.children.sort(compareCoaNodes)
  }
  roots.sort(compareCoaNodes)

  // Step 4: Add orphan folder if there are any orphans or cycles
  if (orphans.length > 0) {
    orphans.sort(compareCoaNodes)
    const orphanFolder: CoaNode = {
      coaId: ORPHAN_FOLDER_ID,
      parentId: null,
      code: '',
      name: 'Akun tanpa induk',
      status: 'HEADER',
      level: 0,
      accountGroup: 'Other Assets',
      subAccountGroup: '',
      saldoNormal: 'DEBET',
      children: orphans,
      isOrphan: true,
    }
    byId.set(ORPHAN_FOLDER_ID, orphanFolder)
    roots.push(orphanFolder)
  }

  return {
    roots,
    byId,
    orphanFolderId: ORPHAN_FOLDER_ID,
  }
}

/** Returns all POSTABLE descendants (includes itself when POSTABLE). */
export function postableDescendants(tree: CoaTree, coaId: Id): Id[] {
  const node = tree.byId.get(coaId)
  if (!node) return []

  if (node.status === 'POSTABLE') {
    return [node.coaId]
  }

  const results: Id[] = []
  const queue = [...node.children]
  const visited = new Set<Id>()

  while (queue.length > 0) {
    const curr = queue.shift()!
    if (visited.has(curr.coaId)) continue
    visited.add(curr.coaId)

    if (curr.status === 'POSTABLE') {
      results.push(curr.coaId)
    }
    if (curr.children.length > 0) {
      queue.push(...curr.children)
    }
  }

  return results
}

/** Returns all ancestor IDs starting from immediate parent up to the root. */
export function ancestorsOf(tree: CoaTree, coaId: Id): Id[] {
  const ancestors: Id[] = []
  const visited = new Set<Id>([coaId])

  let current = tree.byId.get(coaId)
  while (current && current.parentId) {
    const parentId = current.parentId
    if (visited.has(parentId)) break // cycle safety
    visited.add(parentId)
    ancestors.push(parentId)
    current = tree.byId.get(parentId)
  }

  return ancestors
}

const postableByGroupCache = new WeakMap<CoaTree, Map<AccountGroup, Id[]>>()

/** Ids of the POSTABLE accounts of the given groups (the orphan folder excluded); indexed once per tree. */
export function postableAccountIds(tree: CoaTree, groups: readonly AccountGroup[]): Id[] {
  let index = postableByGroupCache.get(tree)
  if (!index) {
    index = new Map()
    for (const node of tree.byId.values()) {
      if (node.status !== 'POSTABLE' || node.coaId === tree.orphanFolderId) continue
      const list = index.get(node.accountGroup) ?? []
      list.push(node.coaId)
      index.set(node.accountGroup, list)
    }
    postableByGroupCache.set(tree, index)
  }
  const cached = index
  return groups.flatMap((g) => cached.get(g) ?? [])
}
