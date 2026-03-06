/**
 * API проектов: список, создание, загрузка, удаление.
 */

import type {
  Project,
  ProjectListItem,
  ProjectType,
  SeparationProject,
} from '../types/project.types';

const API = '/api';

async function authFetch(
  path: string,
  options: RequestInit & { token?: string | null }
): Promise<Response> {
  const { token, ...rest } = options;
  const headers = new Headers(rest.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API}${path}`, { ...rest, headers });
}

export async function fetchProjects(
  token: string | null
): Promise<ProjectListItem[]> {
  if (!token) return [];
  const res = await authFetch('/projects', { token });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchProject(
  id: string,
  token: string | null
): Promise<Project | null> {
  if (!token) return null;
  const res = await authFetch(`/projects/${id}`, { token });
  if (!res.ok) return null;
  return res.json();
}

export async function deleteProject(
  id: string,
  token: string | null
): Promise<boolean> {
  if (!token) return false;
  const res = await authFetch(`/projects/${id}`, {
    method: 'DELETE',
    token,
  });
  return res.ok;
}

export interface CreateSeparationProjectParams {
  name: string;
  duration: number;
  stemFiles: File[]; // WAV buffers for vocals, drums, etc.
}

export async function createSeparationProject(
  params: CreateSeparationProjectParams,
  token: string | null
): Promise<SeparationProject | null> {
  if (!token) return null;
  const form = new FormData();
  form.append('name', params.name);
  form.append('type', 'separation');
  form.append('duration', String(params.duration));
  params.stemFiles.forEach((file, i) => {
    form.append('stems', file, file.name || `stem_${i}.wav`);
  });
  const res = await authFetch('/projects', {
    method: 'POST',
    body: form,
    token,
  });
  if (!res.ok) return null;
  return res.json();
}

export function getProjectStemUrl(
  projectId: string,
  stemFileName: string
): string {
  const encoded = encodeURIComponent(stemFileName);
  return `${API}/projects/${projectId}/stems/${encoded}`;
}

export async function downloadProjectStem(
  projectId: string,
  stemFileName: string,
  token: string | null
): Promise<ArrayBuffer | null> {
  if (!token) return null;
  const url = getProjectStemUrl(projectId, stemFileName);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.arrayBuffer();
}
