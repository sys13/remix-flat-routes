import * as path from 'path'
import { getRouteSegments, visitFiles } from './util'

type RouteInfo = {
  path: string
  file: string
  name: string
  parent?: string // first pass parent is undefined
  isIndex: boolean
}

type DefineRouteOptions = {
  caseSensitive?: boolean
  index?: boolean
}

type DefineRouteChildren = {
  (): void
}

type DefineRouteFunction = (
  path: string | undefined,
  file: string,
  optionsOrChildren?: DefineRouteOptions | DefineRouteChildren,
  children?: DefineRouteChildren,
) => void

export type VisitFilesFunction = (
  dir: string,
  visitor: (file: string) => void,
  baseDir?: string,
) => void

type FlatRoutesOptions = {
  basePath?: string
  visitFiles?: VisitFilesFunction
}

type ParentMapEntry = {
  routeInfo: RouteInfo
  children: RouteInfo[]
}

export type DefineRoutesFunction = (
  callback: (route: DefineRouteFunction) => void,
) => any

export default function flatRoutes(
  baseDir: string,
  defineRoutes: DefineRoutesFunction,
  options: FlatRoutesOptions = {},
) {
  const routeMap = new Map<string, RouteInfo>()
  const parentMap = new Map<string, ParentMapEntry>()
  const visitor = options?.visitFiles || visitFiles

  // initialize root route
  routeMap.set('root', {
    path: '',
    file: 'root.tsx',
    name: 'root',
    parent: '',
    isIndex: false,
  })
  var routes = defineRoutes(route => {
    visitor(`app/${baseDir}`, routeFile => {
      const routeInfo = getRouteInfo(baseDir, routeFile, options.basePath)
      if (!routeInfo) return
      routeMap.set(routeInfo.name, routeInfo)
    })
    // setup parent map
    for (let [name, route] of routeMap) {
      if (name === 'root') continue
      let parentRoute = getParentRoute(routeMap, name)
      if (parentRoute) {
        let parent = parentMap.get(parentRoute)
        if (!parent) {
          parent = {
            routeInfo: routeMap.get(parentRoute)!,
            children: [],
          }
          parentMap.set(parentRoute, parent)
        }
        parent.children.push(route)
      }
    }
    // start with root
    getRoutes(parentMap, 'root', route)
  })
  // don't return root since remix already provides it
  if (routes) {
    delete routes.root
  }
  return routes
}

function getParentRoute(
  routeMap: Map<string, RouteInfo>,
  name: string,
): string | null {
  var parentName = name.substring(0, name.lastIndexOf('.'))
  if (parentName === '') {
    return 'root'
  }
  if (routeMap.has(parentName)) {
    return parentName
  }
  return getParentRoute(routeMap, parentName)
}

function getRoutes(
  parentMap: Map<string, ParentMapEntry>,
  parent: string,
  route: DefineRouteFunction,
) {
  let parentRoute = parentMap.get(parent)
  if (parentRoute && parentRoute.children) {
    const routeOptions: DefineRouteOptions = {
      caseSensitive: false,
      index: parentRoute!.routeInfo.isIndex,
    }
    const routeChildren: DefineRouteChildren = () => {
      for (let child of parentRoute!.children) {
        getRoutes(parentMap, child.name, route)
        const path = child.path.substring(
          parentRoute!.routeInfo.path.length + 1,
        )
        route(path, child.file, { index: child.isIndex })
      }
    }
    route(
      parentRoute.routeInfo.path,
      parentRoute.routeInfo.file,
      routeOptions,
      routeChildren,
    )
  }
}

export function getRouteInfo(
  baseDir: string,
  routeFile: string,
  basePath?: string,
): RouteInfo | null {
  let url = basePath ?? ''
  // get extension
  console.log(routeFile)
  let ext = path.extname(routeFile)
  // only process valid route files
  if (!['.js', '.jsx', '.ts', '.tsx', '.md', '.mdx'].includes(ext)) {
    return null
  }
  // remove extension from name
  let name = routeFile.substring(0, routeFile.length - ext.length)
  console.log(`name after ext: ${name}`)
  if (routeFile.includes('/')) {
    // route flat-folder so only process index/layout routes
    if (
      ['/index', '/_index', '/_layout', '/_route', '.route'].every(
        suffix => !name.endsWith(suffix),
      )
    ) {
      // ignore non-index routes
      return null
    }
    if (name.endsWith('.route')) {
      // convert docs/readme.route to docs.readme/_index
      name = name.replace(/\//g, '.').replace(/\.route$/, '/_index')
    }
    name = path.dirname(name)
  }

  let routeSegments = getRouteSegments(name)
  for (let i = 0; i < routeSegments.length; i++) {
    let routeSegment = routeSegments[i]
    url = appendPathSegment(url, routeSegment)
  }
  console.log({ name, routeSegments, url })
  return {
    path: url,
    file: `${baseDir}/${routeFile}`,
    name,
    //parent: parent will be calculated after all routes are defined,
    isIndex:
      routeSegments.at(-1) === 'index' || routeSegments.at(-1) === '_index',
  }
}

function appendPathSegment(url: string, segment: string) {
  if (segment) {
    if (segment.startsWith('_')) {
      // handle pathless route (not included in url)
      return url
    } else if (['index', '_index'].some(name => segment === name)) {
      // handle index route
      if (!url.endsWith('/')) {
        url += '/'
      }
    } else if (segment.startsWith('$')) {
      // handle params
      segment = segment === '$' ? '*' : `:${segment.substring(1)}`
      url += '/' + segment
    } else {
      url += '/' + segment
    }
  }
  return url
}

export { flatRoutes }
export type {
  DefineRouteFunction,
  DefineRouteOptions,
  DefineRouteChildren,
  RouteInfo,
}
