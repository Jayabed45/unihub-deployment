'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Project {
  _id: string;
  name: string;
  description: string;
  // Add other project fields as necessary
}

export default function ProjectDetailsPage() {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function fetchProject() {
      try {
        const res = await fetch(`http://localhost:5000/api/projects/${id}`);
        if (!res.ok) {
          throw new Error('Project not found');
        }
        const data = await res.json();
        setProject(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [id]);

  if (loading) {
    return <div className="text-center p-10">Loading project details...</div>;
  }

  if (error) {
    return <div className="text-center p-10 text-red-500">Error: {error}</div>;
  }

  if (!project) {
    return <div className="text-center p-10">Project not found.</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">{project.name}</h1>
      <p className="text-gray-600">{project.description}</p>
      {/* More project details will be added here */}
    </div>
  );
}
