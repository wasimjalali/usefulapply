'use client';

import { useState, useCallback, useEffect } from 'react';
import { Edit3, Check, X, Sparkles, Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from './ui/Button';
import { CVData } from '@/lib/cv-templates/types';

interface EditableCVCanvasProps {
  cvData: CVData;
  onSave: (updatedData: CVData) => void;
  onAIImprove?: (section: string, content: string) => Promise<string>;
}

interface EditableFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  label?: string;
}

function EditableField({ value, onChange, placeholder, multiline, className = '', label }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  const handleSave = () => {
    onChange(tempValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="relative group">
        {label && <span className="text-xs text-warm-gray mb-1 block">{label}</span>}
        {multiline ? (
          <textarea
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            placeholder={placeholder}
            className={`w-full p-2 border-2 border-navy-300 rounded focus:border-navy-500 focus:outline-none resize-none ${className}`}
            rows={4}
            autoFocus
          />
        ) : (
          <input
            type="text"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            placeholder={placeholder}
            className={`w-full p-2 border-2 border-navy-300 rounded focus:border-navy-500 focus:outline-none ${className}`}
            autoFocus
          />
        )}
        <div className="flex gap-1 mt-1">
          <button onClick={handleSave} className="p-1 bg-gold-500 text-white rounded hover:bg-gold-600 cursor-pointer" title="Save">
            <Check className="w-3 h-3" />
          </button>
          <button onClick={handleCancel} className="p-1 bg-red-500 text-white rounded hover:bg-red-600 cursor-pointer" title="Cancel">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`group cursor-pointer hover:bg-navy-50 rounded px-1 -mx-1 transition-colors ${className}`}
      onClick={() => setIsEditing(true)}
    >
      {label && <span className="text-xs text-warm-gray mb-1 block">{label}</span>}
      <span className={value ? '' : 'text-warm-gray italic'}>
        {value || placeholder || 'Click to edit'}
      </span>
      <Edit3 className="w-3 h-3 inline-block ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />
    </div>
  );
}

export function EditableCVCanvas({ cvData, onSave, onAIImprove }: EditableCVCanvasProps) {
  const [data, setData] = useState<CVData>(cvData);
  const [hasChanges, setHasChanges] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState<string | null>(null);

  // Sync internal state when cvData prop changes externally (e.g., tab switch, regeneration)
  useEffect(() => {
    if (!hasChanges) {
      setData(cvData);
    }
  }, [cvData, hasChanges]);

  const updateField = useCallback((path: string, value: string | string[]) => {
    setData(prev => {
      const newData = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = newData;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return newData;
    });
    setHasChanges(true);
  }, []);

  const handleSave = () => {
    onSave(data);
    setHasChanges(false);
  };

  const handleReset = () => {
    setData(cvData);
    setHasChanges(false);
  };

  const handleAIImprove = async (section: string, content: string) => {
    if (!onAIImprove) return;
    setIsAIProcessing(section);
    try {
      const improved = await onAIImprove(section, content);
      if (section === 'summary') {
        updateField('summary', improved);
      }
    } catch (error) {
      console.error('AI improvement failed:', error);
    } finally {
      setIsAIProcessing(null);
    }
  };

  const addExperienceBullet = (expIndex: number) => {
    const newBullets = [...data.experience[expIndex].bullets, ''];
    const newExperience = [...data.experience];
    newExperience[expIndex] = { ...newExperience[expIndex], bullets: newBullets };
    setData(prev => ({ ...prev, experience: newExperience }));
    setHasChanges(true);
  };

  const updateExperienceBullet = (expIndex: number, bulletIndex: number, value: string) => {
    const newBullets = [...data.experience[expIndex].bullets];
    newBullets[bulletIndex] = value;
    const newExperience = [...data.experience];
    newExperience[expIndex] = { ...newExperience[expIndex], bullets: newBullets };
    setData(prev => ({ ...prev, experience: newExperience }));
    setHasChanges(true);
  };

  const removeExperienceBullet = (expIndex: number, bulletIndex: number) => {
    const newBullets = data.experience[expIndex].bullets.filter((_, i) => i !== bulletIndex);
    const newExperience = [...data.experience];
    newExperience[expIndex] = { ...newExperience[expIndex], bullets: newBullets };
    setData(prev => ({ ...prev, experience: newExperience }));
    setHasChanges(true);
  };

  const addSkill = (categoryIndex: number) => {
    const newItems = [...data.skills[categoryIndex].items, ''];
    const newSkills = [...data.skills];
    newSkills[categoryIndex] = { ...newSkills[categoryIndex], items: newItems };
    setData(prev => ({ ...prev, skills: newSkills }));
    setHasChanges(true);
  };

  const updateSkill = (categoryIndex: number, skillIndex: number, value: string) => {
    const newItems = [...data.skills[categoryIndex].items];
    newItems[skillIndex] = value;
    const newSkills = [...data.skills];
    newSkills[categoryIndex] = { ...newSkills[categoryIndex], items: newItems };
    setData(prev => ({ ...prev, skills: newSkills }));
    setHasChanges(true);
  };

  const removeSkill = (categoryIndex: number, skillIndex: number) => {
    const newItems = data.skills[categoryIndex].items.filter((_, i) => i !== skillIndex);
    const newSkills = [...data.skills];
    newSkills[categoryIndex] = { ...newSkills[categoryIndex], items: newItems };
    setData(prev => ({ ...prev, skills: newSkills }));
    setHasChanges(true);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      {/* Header with Save/Reset */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-cream-300">
        <div className="flex items-center gap-2">
          <Edit3 className="w-5 h-5 text-navy-600" />
          <h2 className="text-lg font-semibold text-charcoal">Edit Your CV</h2>
          {hasChanges && (
            <span className="px-2 py-0.5 text-xs bg-gold-100 text-gold-700 rounded-full">
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Reset
              </Button>
              <Button variant="primary" size="sm" onClick={handleSave}>
                <Check className="w-4 h-4 mr-1" />
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Personal Information */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-navy-600 mb-3">
          Personal Information
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <EditableField
            label="Full Name"
            value={data.personal.fullName}
            onChange={(v) => updateField('personal.fullName', v)}
            placeholder="Your full name"
          />
          <EditableField
            label="Professional Title"
            value={data.personal.currentTitle || ''}
            onChange={(v) => updateField('personal.currentTitle', v)}
            placeholder="e.g., Senior Software Engineer"
          />
          <EditableField
            label="Email"
            value={data.personal.email}
            onChange={(v) => updateField('personal.email', v)}
            placeholder="your@email.com"
          />
          <EditableField
            label="Phone"
            value={data.personal.phone}
            onChange={(v) => updateField('personal.phone', v)}
            placeholder="+1 234 567 8900"
          />
          <EditableField
            label="Address"
            value={data.personal.address || ''}
            onChange={(v) => updateField('personal.address', v)}
            placeholder="Street address"
          />
          <EditableField
            label="City"
            value={data.personal.city || ''}
            onChange={(v) => updateField('personal.city', v)}
            placeholder="City"
          />
          <EditableField
            label="Country"
            value={data.personal.country || ''}
            onChange={(v) => updateField('personal.country', v)}
            placeholder="Country"
          />
          <EditableField
            label="LinkedIn URL"
            value={data.personal.linkedIn || ''}
            onChange={(v) => updateField('personal.linkedIn', v)}
            placeholder="linkedin.com/in/yourprofile"
          />
          <EditableField
            label="GitHub URL"
            value={data.personal.github || ''}
            onChange={(v) => updateField('personal.github', v)}
            placeholder="github.com/yourusername"
          />
          <EditableField
            label="Portfolio URL"
            value={data.personal.portfolio || ''}
            onChange={(v) => updateField('personal.portfolio', v)}
            placeholder="yourportfolio.com"
          />
          <EditableField
            label="Website"
            value={data.personal.website || ''}
            onChange={(v) => updateField('personal.website', v)}
            placeholder="yourwebsite.com"
          />
        </div>
        
        {/* EU/German CV Optional Fields */}
        <div className="mt-4 pt-4 border-t border-cream-200">
          <p className="text-xs text-warm-gray mb-3">Optional fields for EU/German CVs:</p>
          <div className="grid grid-cols-2 gap-4">
            <EditableField
              label="Date of Birth"
              value={data.personal.dateOfBirth || ''}
              onChange={(v) => updateField('personal.dateOfBirth', v)}
              placeholder="DD.MM.YYYY (optional)"
            />
            <EditableField
              label="Nationality"
              value={data.personal.nationality || ''}
              onChange={(v) => updateField('personal.nationality', v)}
              placeholder="e.g., German (optional)"
            />
          </div>
        </div>
      </section>
      
      {/* Signature Section for German CVs */}
      <section className="mb-6 p-4 bg-cream-50 rounded-lg border border-cream-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-navy-600">
            Signature (German CV)
          </h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={data.signature?.includeSignature || false}
              onChange={(e) => {
                const newSignature = {
                  city: data.signature?.city || data.personal.city || '',
                  date: data.signature?.date || new Date().toLocaleDateString('de-DE'),
                  signatureImageUrl: data.signature?.signatureImageUrl,
                  includeSignature: e.target.checked,
                };
                setData(prev => ({ ...prev, signature: newSignature }));
                setHasChanges(true);
              }}
              className="rounded border-cream-300"
            />
            <span className="text-warm-gray">Include signature line</span>
          </label>
        </div>
        {data.signature?.includeSignature && (
          <div className="grid grid-cols-2 gap-4">
            <EditableField
              label="City"
              value={data.signature?.city || ''}
              onChange={(v) => {
                setData(prev => ({ 
                  ...prev, 
                  signature: { ...prev.signature!, city: v }
                }));
                setHasChanges(true);
              }}
              placeholder="Berlin"
            />
            <EditableField
              label="Date (DD.MM.YYYY)"
              value={data.signature?.date || ''}
              onChange={(v) => {
                setData(prev => ({ 
                  ...prev, 
                  signature: { ...prev.signature!, date: v }
                }));
                setHasChanges(true);
              }}
              placeholder="31.01.2026"
            />
          </div>
        )}
        <p className="text-xs text-warm-gray mt-2">
          German CVs require a signature with city and date per 2026 standards.
        </p>
      </section>

      {/* Professional Summary */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-navy-600">
            Professional Summary
          </h3>
          {onAIImprove && data.summary && (
            <button
              onClick={() => handleAIImprove('summary', data.summary || '')}
              disabled={isAIProcessing === 'summary'}
              className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {isAIProcessing === 'summary' ? (
                <div className="w-3 h-3 border-2 border-navy-300 border-t-navy-600 rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              Improve with AI
            </button>
          )}
        </div>
        <EditableField
          value={data.summary || ''}
          onChange={(v) => updateField('summary', v)}
          placeholder="Write a compelling professional summary..."
          multiline
          className="text-sm"
        />
      </section>

      {/* Experience */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-navy-600 mb-3">
          Professional Experience
        </h3>
        {data.experience.map((exp, expIndex) => (
          <div key={exp.id} className="mb-4 p-4 bg-cream-50 rounded-lg border border-cream-200">
            <div className="flex items-start gap-2 mb-2">
              <GripVertical className="w-4 h-4 text-warm-gray mt-1 cursor-grab" />
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <EditableField
                    label="Position"
                    value={exp.position}
                    onChange={(v) => {
                      const newExp = [...data.experience];
                      newExp[expIndex] = { ...newExp[expIndex], position: v };
                      setData(prev => ({ ...prev, experience: newExp }));
                      setHasChanges(true);
                    }}
                    placeholder="Job title"
                    className="font-medium"
                  />
                  <EditableField
                    label="Company"
                    value={exp.company}
                    onChange={(v) => {
                      const newExp = [...data.experience];
                      newExp[expIndex] = { ...newExp[expIndex], company: v };
                      setData(prev => ({ ...prev, experience: newExp }));
                      setHasChanges(true);
                    }}
                    placeholder="Company name"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <EditableField
                    label="Start Date"
                    value={exp.startDate}
                    onChange={(v) => {
                      const newExp = [...data.experience];
                      newExp[expIndex] = { ...newExp[expIndex], startDate: v };
                      setData(prev => ({ ...prev, experience: newExp }));
                      setHasChanges(true);
                    }}
                    placeholder="Jan 2020"
                    className="text-sm"
                  />
                  <EditableField
                    label="End Date"
                    value={exp.endDate || (exp.current ? 'Present' : '')}
                    onChange={(v) => {
                      const newExp = [...data.experience];
                      newExp[expIndex] = { ...newExp[expIndex], endDate: v, current: v.toLowerCase() === 'present' };
                      setData(prev => ({ ...prev, experience: newExp }));
                      setHasChanges(true);
                    }}
                    placeholder="Present"
                    className="text-sm"
                  />
                  <EditableField
                    label="Location"
                    value={exp.location || ''}
                    onChange={(v) => {
                      const newExp = [...data.experience];
                      newExp[expIndex] = { ...newExp[expIndex], location: v };
                      setData(prev => ({ ...prev, experience: newExp }));
                      setHasChanges(true);
                    }}
                    placeholder="City, Country"
                    className="text-sm"
                  />
                </div>
                
                {/* Bullets */}
                <div className="space-y-1">
                  <span className="text-xs text-warm-gray">Achievements & Responsibilities</span>
                  {exp.bullets.map((bullet, bulletIndex) => (
                    <div key={bulletIndex} className="flex items-start gap-2 group">
                      <span className="text-warm-gray mt-2">•</span>
                      <EditableField
                        value={bullet}
                        onChange={(v) => updateExperienceBullet(expIndex, bulletIndex, v)}
                        placeholder="Describe your achievement..."
                        className="flex-1 text-sm"
                      />
                      <button
                        onClick={() => removeExperienceBullet(expIndex, bulletIndex)}
                        className="p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Remove bullet point"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addExperienceBullet(expIndex)}
                    className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 mt-2 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Add bullet point
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Skills */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-navy-600 mb-3">
          Skills
        </h3>
        {data.skills.map((skillGroup, catIndex) => (
          <div key={`skill-cat-${catIndex}`} className="mb-3">
            <EditableField
              label="Category"
              value={skillGroup.category}
              onChange={(v) => {
                const newSkills = [...data.skills];
                newSkills[catIndex] = { ...newSkills[catIndex], category: v };
                setData(prev => ({ ...prev, skills: newSkills }));
                setHasChanges(true);
              }}
              className="font-medium text-sm mb-2"
            />
            <div className="flex flex-wrap gap-2">
              {skillGroup.items.map((skill, skillIndex) => (
                <div key={skillIndex} className="flex items-center gap-1 bg-cream-100 rounded px-2 py-1 group">
                  <EditableField
                    value={skill}
                    onChange={(v) => updateSkill(catIndex, skillIndex, v)}
                    placeholder="Skill"
                    className="text-sm"
                  />
                  <button
                    onClick={() => removeSkill(catIndex, skillIndex)}
                    className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Remove skill"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => addSkill(catIndex)}
                className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 px-2 py-1 border border-dashed border-navy-300 rounded cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                Add skill
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* Projects */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-navy-600 mb-3">
          Projects
        </h3>
        {(data.projects || []).map((proj, projIndex) => (
          <div key={proj.id || `proj-${projIndex}`} className="mb-4 p-4 bg-cream-50 rounded-lg border border-cream-200">
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <EditableField
                    label="Project Name"
                    value={proj.name}
                    onChange={(v) => {
                      const newProjects = [...(data.projects || [])];
                      newProjects[projIndex] = { ...newProjects[projIndex], name: v };
                      setData(prev => ({ ...prev, projects: newProjects }));
                      setHasChanges(true);
                    }}
                    placeholder="Project name"
                    className="font-medium"
                  />
                  <EditableField
                    label="URL (optional)"
                    value={proj.url || ''}
                    onChange={(v) => {
                      const newProjects = [...(data.projects || [])];
                      newProjects[projIndex] = { ...newProjects[projIndex], url: v || undefined };
                      setData(prev => ({ ...prev, projects: newProjects }));
                      setHasChanges(true);
                    }}
                    placeholder="https://..."
                    className="text-sm"
                  />
                </div>
                <EditableField
                  label="Description"
                  value={proj.description}
                  onChange={(v) => {
                    const newProjects = [...(data.projects || [])];
                    newProjects[projIndex] = { ...newProjects[projIndex], description: v };
                    setData(prev => ({ ...prev, projects: newProjects }));
                    setHasChanges(true);
                  }}
                  placeholder="1-2 sentences describing the project"
                  multiline
                  className="text-sm mb-2"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-xs text-warm-gray">Technologies:</span>
                  {(proj.technologies || []).map((tech, techIndex) => (
                    <div key={techIndex} className="flex items-center gap-1 bg-cream-100 rounded px-2 py-1 group">
                      <EditableField
                        value={tech}
                        onChange={(v) => {
                          const newProjects = [...(data.projects || [])];
                          const newTech = [...(newProjects[projIndex].technologies || [])];
                          newTech[techIndex] = v;
                          newProjects[projIndex] = { ...newProjects[projIndex], technologies: newTech };
                          setData(prev => ({ ...prev, projects: newProjects }));
                          setHasChanges(true);
                        }}
                        placeholder="Tech"
                        className="text-sm"
                      />
                      <button
                        onClick={() => {
                          const newProjects = [...(data.projects || [])];
                          const newTech = (newProjects[projIndex].technologies || []).filter((_, i) => i !== techIndex);
                          newProjects[projIndex] = { ...newProjects[projIndex], technologies: newTech };
                          setData(prev => ({ ...prev, projects: newProjects }));
                          setHasChanges(true);
                        }}
                        className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Remove technology"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const newProjects = [...(data.projects || [])];
                      const newTech = [...(newProjects[projIndex].technologies || []), ''];
                      newProjects[projIndex] = { ...newProjects[projIndex], technologies: newTech };
                      setData(prev => ({ ...prev, projects: newProjects }));
                      setHasChanges(true);
                    }}
                    className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 px-2 py-1 border border-dashed border-navy-300 rounded cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Add tech
                  </button>
                </div>
              </div>
              <button
                onClick={() => {
                  const newProjects = (data.projects || []).filter((_, i) => i !== projIndex);
                  setData(prev => ({ ...prev, projects: newProjects.length > 0 ? newProjects : undefined }));
                  setHasChanges(true);
                }}
                className="p-1 text-red-400 hover:text-red-600 transition-colors cursor-pointer"
                title="Remove project"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => {
            const newProject = {
              id: `proj-${Date.now()}`,
              name: '',
              description: '',
              technologies: [],
            };
            setData(prev => ({ ...prev, projects: [...(prev.projects || []), newProject] }));
            setHasChanges(true);
          }}
          className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 px-2 py-1 border border-dashed border-navy-300 rounded cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          Add project
        </button>
      </section>

      {/* Education */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-navy-600 mb-3">
          Education
        </h3>
        {data.education.map((edu, eduIndex) => (
          <div key={edu.id} className="mb-3 p-3 bg-cream-50 rounded-lg border border-cream-200">
            <div className="grid grid-cols-2 gap-2">
              <EditableField
                label="Institution"
                value={edu.institution}
                onChange={(v) => {
                  const newEdu = [...data.education];
                  newEdu[eduIndex] = { ...newEdu[eduIndex], institution: v };
                  setData(prev => ({ ...prev, education: newEdu }));
                  setHasChanges(true);
                }}
                placeholder="University name"
                className="font-medium"
              />
              <EditableField
                label="Degree"
                value={edu.degree}
                onChange={(v) => {
                  const newEdu = [...data.education];
                  newEdu[eduIndex] = { ...newEdu[eduIndex], degree: v };
                  setData(prev => ({ ...prev, education: newEdu }));
                  setHasChanges(true);
                }}
                placeholder="Bachelor's, Master's, etc."
              />
              <EditableField
                label="Field of Study"
                value={edu.field || ''}
                onChange={(v) => {
                  const newEdu = [...data.education];
                  newEdu[eduIndex] = { ...newEdu[eduIndex], field: v };
                  setData(prev => ({ ...prev, education: newEdu }));
                  setHasChanges(true);
                }}
                placeholder="Computer Science, Business, etc."
              />
              <EditableField
                label="Graduation Year"
                value={edu.endDate || ''}
                onChange={(v) => {
                  const newEdu = [...data.education];
                  newEdu[eduIndex] = { ...newEdu[eduIndex], endDate: v };
                  setData(prev => ({ ...prev, education: newEdu }));
                  setHasChanges(true);
                }}
                placeholder="2020"
              />
            </div>
          </div>
        ))}
      </section>

      {/* Certifications */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-navy-600 mb-3">
          Certifications
        </h3>
        <div className="space-y-2">
          {data.certifications.map((cert, certIndex) => (
            <div key={cert.id || `cert-${certIndex}`} className="flex items-center gap-2 p-2 bg-cream-50 rounded border border-cream-200 group">
              <EditableField
                value={cert.name}
                onChange={(v) => {
                  const newCerts = [...data.certifications];
                  newCerts[certIndex] = { ...newCerts[certIndex], name: v };
                  setData(prev => ({ ...prev, certifications: newCerts }));
                  setHasChanges(true);
                }}
                placeholder="Certification name"
                className="flex-1"
              />
              <EditableField
                value={cert.issuer}
                onChange={(v) => {
                  const newCerts = [...data.certifications];
                  newCerts[certIndex] = { ...newCerts[certIndex], issuer: v };
                  setData(prev => ({ ...prev, certifications: newCerts }));
                  setHasChanges(true);
                }}
                placeholder="Issuer"
                className="text-sm text-warm-gray"
              />
              <EditableField
                value={cert.date || ''}
                onChange={(v) => {
                  const newCerts = [...data.certifications];
                  newCerts[certIndex] = { ...newCerts[certIndex], date: v };
                  setData(prev => ({ ...prev, certifications: newCerts }));
                  setHasChanges(true);
                }}
                placeholder="Date"
                className="text-sm text-warm-gray"
              />
              <button
                onClick={() => {
                  const newCerts = data.certifications.filter((_, i) => i !== certIndex);
                  setData(prev => ({ ...prev, certifications: newCerts }));
                  setHasChanges(true);
                }}
                className="p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Remove certification"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const newCert = {
                id: `cert-${Date.now()}`,
                name: '',
                issuer: '',
                date: '',
              };
              setData(prev => ({ ...prev, certifications: [...prev.certifications, newCert] }));
              setHasChanges(true);
            }}
            className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 px-2 py-1 border border-dashed border-navy-300 rounded cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Add certification
          </button>
        </div>
      </section>

      {/* Additional Information */}
      <section className="mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-navy-600 mb-3">
          Additional Information
        </h3>
        <div className="space-y-2">
          {(data.additionalInfo || []).map((item, itemIndex) => (
            <div key={`addl-${itemIndex}`} className="flex items-start gap-2 group">
              <span className="text-warm-gray mt-2">•</span>
              <EditableField
                value={item}
                onChange={(v) => {
                  const newInfo = [...(data.additionalInfo || [])];
                  newInfo[itemIndex] = v;
                  setData(prev => ({ ...prev, additionalInfo: newInfo }));
                  setHasChanges(true);
                }}
                placeholder="e.g., Work authorization, volunteer work, awards, interests..."
                className="flex-1 text-sm"
              />
              <button
                onClick={() => {
                  const newInfo = (data.additionalInfo || []).filter((_, i) => i !== itemIndex);
                  setData(prev => ({ ...prev, additionalInfo: newInfo.length > 0 ? newInfo : undefined }));
                  setHasChanges(true);
                }}
                className="p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Remove item"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              setData(prev => ({ ...prev, additionalInfo: [...(prev.additionalInfo || []), ''] }));
              setHasChanges(true);
            }}
            className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 px-2 py-1 border border-dashed border-navy-300 rounded cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Add item
          </button>
        </div>
      </section>

      {/* Languages */}
      <section>
        <h3 className="text-sm font-bold uppercase tracking-wider text-navy-600 mb-3">
          Languages
        </h3>
        <div className="flex flex-wrap gap-2">
          {data.languages.map((lang, langIndex) => (
            <div key={`lang-${langIndex}`} className="flex items-center gap-2 bg-cream-100 rounded px-3 py-1 group">
              <EditableField
                value={lang.language}
                onChange={(v) => {
                  const newLangs = [...data.languages];
                  newLangs[langIndex] = { ...newLangs[langIndex], language: v };
                  setData(prev => ({ ...prev, languages: newLangs }));
                  setHasChanges(true);
                }}
                className="font-medium text-sm"
              />
              <span className="text-warm-gray">-</span>
              <EditableField
                value={lang.proficiency}
                onChange={(v) => {
                  const newLangs = [...data.languages];
                  newLangs[langIndex] = { ...newLangs[langIndex], proficiency: v };
                  setData(prev => ({ ...prev, languages: newLangs }));
                  setHasChanges(true);
                }}
                className="text-sm text-warm-gray"
              />
              <button
                onClick={() => {
                  const newLangs = data.languages.filter((_, i) => i !== langIndex);
                  setData(prev => ({ ...prev, languages: newLangs }));
                  setHasChanges(true);
                }}
                className="p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Remove language"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const newLang = { language: '', proficiency: '' };
              setData(prev => ({ ...prev, languages: [...prev.languages, newLang] }));
              setHasChanges(true);
            }}
            className="flex items-center gap-1 text-xs text-navy-600 hover:text-navy-800 px-2 py-1 border border-dashed border-navy-300 rounded cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Add language
          </button>
        </div>
      </section>
    </div>
  );
}
